const functions = require("@google-cloud/functions-framework");
const { BigQuery } = require("@google-cloud/bigquery");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

// Initialize clients
const bigquery = new BigQuery();

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET_ID = "boq_dataset";
const RESOURCE_SPECS_TABLE = "gcp_resource_specifications";
const BOQ_RESULTS_TABLE = "gcp_boq_results";
const PRICING_CATALOG_TABLE = "gcp_pricing_catalog";

// CORS middleware
const corsHandler = cors({ origin: true });

/**
 * Cloud Function to calculate Bill of Quantities for GCP resources
 */
functions.http("calculateBoQ", async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      console.log("Starting BoQ calculation");

      const { projectIds, resourceIds, regions, pricingModels, requestedBy } =
        req.body;

      // Generate unique BoQ ID
      const boqId = uuidv4();

      // Fetch resource specifications
      const resourceSpecs = await fetchResourceSpecifications({
        projectIds,
        resourceIds,
        regions,
        pricingModels,
      });

      if (resourceSpecs.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No resource specifications found matching the criteria",
        });
      }

      console.log(`Found ${resourceSpecs.length} resources to calculate`);

      // Calculate BoQ for each resource
      const boqResults = [];
      for (const resource of resourceSpecs) {
        try {
          const boqResult = await calculateResourceBoQ(
            resource,
            boqId,
            requestedBy
          );
          boqResults.push(boqResult);
        } catch (error) {
          console.error(
            `Error calculating BoQ for resource ${resource.resource_id}:`,
            error
          );
          // Continue with other resources
        }
      }

      // Save results to BigQuery
      if (boqResults.length > 0) {
        await saveBoQResults(boqResults);
      }

      // Calculate summary
      const summary = calculateSummary(boqResults);

      res.status(200).json({
        success: true,
        message: "BoQ calculation completed successfully",
        boq_id: boqId,
        resources_processed: boqResults.length,
        summary: summary,
        results: boqResults,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in BoQ calculation:", error);
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
});

/**
 * Fetch resource specifications from BigQuery
 */
async function fetchResourceSpecifications(filters) {
  const conditions = [];
  const params = {};

  if (filters.projectIds && filters.projectIds.length > 0) {
    conditions.push("project_id IN UNNEST(@projectIds)");
    params.projectIds = filters.projectIds;
  }

  if (filters.resourceIds && filters.resourceIds.length > 0) {
    conditions.push("resource_id IN UNNEST(@resourceIds)");
    params.resourceIds = filters.resourceIds;
  }

  if (filters.regions && filters.regions.length > 0) {
    conditions.push("region IN UNNEST(@regions)");
    params.regions = filters.regions;
  }

  if (filters.pricingModels && filters.pricingModels.length > 0) {
    conditions.push("pricing_model IN UNNEST(@pricingModels)");
    params.pricingModels = filters.pricingModels;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT *
    FROM \`${PROJECT_ID}.${DATASET_ID}.${RESOURCE_SPECS_TABLE}\`
    ${whereClause}
    ORDER BY project_id, resource_id
  `;

  const options = {
    query: query,
    params: params,
    types: params,
  };

  const [rows] = await bigquery.query(options);
  return rows;
}

/**
 * Calculate BoQ for a single resource
 */
async function calculateResourceBoQ(resource, boqId, requestedBy) {
  console.log(`Calculating BoQ for resource: ${resource.resource_id}`);

  // Fetch pricing information
  const pricing = await fetchPricingForResource(resource);

  // Calculate base costs
  const costs = calculateBaseCosts(resource, pricing);

  // Apply discounts
  const discounts = calculateDiscounts(resource, costs);

  // Calculate final totals
  const totals = calculateTotals(costs, discounts);

  return {
    boq_id: boqId,
    calculation_timestamp: new Date().toISOString(),
    requested_by: requestedBy,
    resource_id: resource.resource_id,
    project_id: resource.project_id,
    instance_name: resource.instance_name,
    machine_type: resource.machine_type,
    vcpu_count: resource.vcpu_count,
    memory_gb: resource.memory_gb,
    disk_type: resource.disk_type,
    disk_size_gb: resource.disk_size_gb,
    region: resource.region,
    pricing_model: resource.pricing_model,
    usage_duration_hours: resource.usage_duration_hours,
    usage_pattern: resource.usage_pattern,

    // Cost breakdown
    compute_cost_usd: costs.compute,
    memory_cost_usd: costs.memory,
    storage_cost_usd: costs.storage,
    network_cost_usd: costs.network,
    gpu_cost_usd: costs.gpu,

    // Pricing details
    compute_price_per_hour: pricing.compute_price_per_hour,
    memory_price_per_gb_hour: pricing.memory_price_per_gb_hour,
    storage_price_per_gb_month: pricing.storage_price_per_gb_month,

    // Discount information
    sustained_use_discount_percent: discounts.sud_percent,
    committed_use_discount_percent: discounts.cud_percent,
    spot_discount_percent: discounts.spot_percent,

    // Totals
    subtotal_usd: totals.subtotal,
    total_discount_usd: totals.total_discount,
    total_cost_usd: totals.total_cost,

    // Additional storage costs
    additional_storage_costs: calculateAdditionalStorageCosts(
      resource,
      pricing
    ),

    // Metadata
    pricing_date: new Date().toISOString().split("T")[0],
    calculation_version: "1.0",
    cost_center: resource.cost_center,
    environment: resource.environment,
    team: resource.team,
  };
}

/**
 * Fetch pricing information for a resource
 */
async function fetchPricingForResource(resource) {
  const pricing = {
    compute_price_per_hour: 0,
    memory_price_per_gb_hour: 0,
    storage_price_per_gb_month: 0,
    network_price_per_gb: 0,
    gpu_price_per_hour: 0,
  };

  try {
    // Query pricing catalog for compute pricing
    const computeQuery = `
      SELECT price_per_unit, pricing_unit
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PRICING_CATALOG_TABLE}\`
      WHERE service_name = 'Compute Engine'
        AND category = 'compute'
        AND (machine_type = @machineType OR machine_family = @machineFamily)
        AND (region = @region OR region IS NULL)
        AND usage_type = @usageType
        AND is_active = true
      ORDER BY 
        CASE WHEN machine_type = @machineType THEN 1 ELSE 2 END,
        CASE WHEN region = @region THEN 1 ELSE 2 END
      LIMIT 1
    `;

    const usageType = getUsageType(resource.pricing_model);
    const machineFamily = resource.machine_type.split("-")[0];

    const [computeRows] = await bigquery.query({
      query: computeQuery,
      params: {
        machineType: resource.machine_type,
        machineFamily: machineFamily,
        region: resource.region,
        usageType: usageType,
      },
    });

    if (computeRows.length > 0) {
      pricing.compute_price_per_hour = computeRows[0].price_per_unit;
    } else {
      // Fallback to estimated pricing based on vCPU and memory
      pricing.compute_price_per_hour = estimateComputePricing(resource);
    }

    // Query for storage pricing
    const storageQuery = `
      SELECT price_per_unit
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PRICING_CATALOG_TABLE}\`
      WHERE service_name = 'Compute Engine'
        AND category = 'storage'
        AND disk_type = @diskType
        AND (region = @region OR region IS NULL)
        AND is_active = true
      ORDER BY CASE WHEN region = @region THEN 1 ELSE 2 END
      LIMIT 1
    `;

    const [storageRows] = await bigquery.query({
      query: storageQuery,
      params: {
        diskType: resource.disk_type,
        region: resource.region,
      },
    });

    if (storageRows.length > 0) {
      pricing.storage_price_per_gb_month = storageRows[0].price_per_unit;
    } else {
      // Fallback pricing
      pricing.storage_price_per_gb_month = getDefaultStoragePricing(
        resource.disk_type
      );
    }

    // GPU pricing if applicable
    if (resource.gpu_count && resource.gpu_count > 0) {
      const gpuQuery = `
        SELECT price_per_unit
        FROM \`${PROJECT_ID}.${DATASET_ID}.${PRICING_CATALOG_TABLE}\`
        WHERE service_name = 'Compute Engine'
          AND category = 'gpu'
          AND gpu_type = @gpuType
          AND (region = @region OR region IS NULL)
          AND is_active = true
        ORDER BY CASE WHEN region = @region THEN 1 ELSE 2 END
        LIMIT 1
      `;

      const [gpuRows] = await bigquery.query({
        query: gpuQuery,
        params: {
          gpuType: resource.gpu_type,
          region: resource.region,
        },
      });

      if (gpuRows.length > 0) {
        pricing.gpu_price_per_hour = gpuRows[0].price_per_unit;
      }
    }
  } catch (error) {
    console.error("Error fetching pricing:", error);
    // Use fallback pricing
    pricing.compute_price_per_hour = estimateComputePricing(resource);
    pricing.storage_price_per_gb_month = getDefaultStoragePricing(
      resource.disk_type
    );
  }

  return pricing;
}

/**
 * Calculate base costs before discounts
 */
function calculateBaseCosts(resource, pricing) {
  const costs = {
    compute: 0,
    memory: 0,
    storage: 0,
    network: 0,
    gpu: 0,
  };

  // Compute cost (includes CPU and memory in most GCP pricing)
  costs.compute =
    pricing.compute_price_per_hour * resource.usage_duration_hours;

  // Storage cost (convert hours to months for pricing)
  const hoursPerMonth = 730; // Average hours per month
  const storageMonths = resource.usage_duration_hours / hoursPerMonth;
  costs.storage =
    pricing.storage_price_per_gb_month * resource.disk_size_gb * storageMonths;

  // GPU cost if applicable
  if (resource.gpu_count && resource.gpu_count > 0) {
    costs.gpu =
      pricing.gpu_price_per_hour *
      resource.gpu_count *
      resource.usage_duration_hours;
  }

  // Network cost (basic estimation for external IP)
  if (resource.external_ip) {
    costs.network = 0.004 * resource.usage_duration_hours; // $0.004/hour for static IP
  }

  return costs;
}

/**
 * Calculate applicable discounts
 */
function calculateDiscounts(resource, costs) {
  const discounts = {
    sud_percent: 0,
    cud_percent: 0,
    spot_percent: 0,
    sud_amount: 0,
    cud_amount: 0,
    spot_amount: 0,
  };

  const totalComputeCost = costs.compute + costs.gpu;

  switch (resource.pricing_model) {
    case "spot":
    case "preemptible":
      discounts.spot_percent = 60; // Up to 60% discount for Spot VMs
      discounts.spot_amount = totalComputeCost * (discounts.spot_percent / 100);
      break;

    case "cud-1-year":
      discounts.cud_percent = 25; // 25% discount for 1-year CUD
      discounts.cud_amount = totalComputeCost * (discounts.cud_percent / 100);
      break;

    case "cud-3-year":
      discounts.cud_percent = 37; // 37% discount for 3-year CUD
      discounts.cud_amount = totalComputeCost * (discounts.cud_percent / 100);
      break;

    case "on-demand":
    default:
      // Apply SUD for continuous usage over 25% of the month
      if (
        resource.usage_duration_hours > 183 &&
        resource.usage_pattern === "continuous"
      ) {
        // 25% of 730 hours
        discounts.sud_percent = Math.min(
          30,
          Math.floor((resource.usage_duration_hours - 183) / 73) * 5
        );
        discounts.sud_amount = totalComputeCost * (discounts.sud_percent / 100);
      }
      break;
  }

  return discounts;
}

/**
 * Calculate final totals
 */
function calculateTotals(costs, discounts) {
  const subtotal =
    costs.compute + costs.memory + costs.storage + costs.network + costs.gpu;
  const totalDiscount =
    discounts.sud_amount + discounts.cud_amount + discounts.spot_amount;
  const totalCost = subtotal - totalDiscount;

  return {
    subtotal,
    total_discount: totalDiscount,
    total_cost: Math.max(0, totalCost), // Ensure non-negative
  };
}

/**
 * Calculate additional storage costs
 */
function calculateAdditionalStorageCosts(resource, pricing) {
  if (!resource.additional_disks || resource.additional_disks.length === 0) {
    return [];
  }

  const hoursPerMonth = 730;
  const storageMonths = resource.usage_duration_hours / hoursPerMonth;

  return resource.additional_disks.map((disk) => ({
    disk_type: disk.disk_type,
    size_gb: disk.size_gb,
    price_per_gb_month: getDefaultStoragePricing(disk.disk_type),
    cost_usd:
      getDefaultStoragePricing(disk.disk_type) * disk.size_gb * storageMonths,
  }));
}

/**
 * Save BoQ results to BigQuery
 */
async function saveBoQResults(results) {
  try {
    const table = bigquery.dataset(DATASET_ID).table(BOQ_RESULTS_TABLE);
    await table.insert(results);
    console.log(`Successfully saved ${results.length} BoQ results to BigQuery`);
  } catch (error) {
    console.error("Error saving BoQ results:", error);
    throw error;
  }
}

/**
 * Calculate summary statistics
 */
function calculateSummary(results) {
  if (results.length === 0) return {};

  const totalCost = results.reduce((sum, r) => sum + r.total_cost_usd, 0);
  const totalDiscount = results.reduce(
    (sum, r) => sum + r.total_discount_usd,
    0
  );
  const avgCost = totalCost / results.length;

  const costByProject = {};
  const costByRegion = {};

  results.forEach((r) => {
    costByProject[r.project_id] =
      (costByProject[r.project_id] || 0) + r.total_cost_usd;
    costByRegion[r.region] = (costByRegion[r.region] || 0) + r.total_cost_usd;
  });

  return {
    total_resources: results.length,
    total_cost_usd: totalCost,
    total_discount_usd: totalDiscount,
    average_cost_per_resource: avgCost,
    cost_by_project: costByProject,
    cost_by_region: costByRegion,
  };
}

// Helper functions
function getUsageType(pricingModel) {
  switch (pricingModel) {
    case "spot":
    case "preemptible":
      return "Preemptible";
    case "cud-1-year":
    case "cud-3-year":
      return "Committed";
    default:
      return "OnDemand";
  }
}

function estimateComputePricing(resource) {
  // Fallback pricing estimates (approximate)
  const basePrice = 0.0475; // Base price per vCPU-hour for n1-standard
  const memoryPrice = 0.0063; // Price per GB-hour for memory

  return resource.vcpu_count * basePrice + resource.memory_gb * memoryPrice;
}

function getDefaultStoragePricing(diskType) {
  // Fallback storage pricing per GB-month
  switch (diskType) {
    case "pd-ssd":
      return 0.17;
    case "pd-balanced":
      return 0.1;
    case "pd-standard":
    default:
      return 0.04;
  }
}

// Export for testing
module.exports = {
  calculateResourceBoQ,
  calculateBaseCosts,
  calculateDiscounts,
  calculateTotals,
};
