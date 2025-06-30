const functions = require("@google-cloud/functions-framework");
const { CloudBillingClient } = require("@google-cloud/billing");
const { BigQuery } = require("@google-cloud/bigquery");
const cors = require("cors");

// Initialize clients
const billingClient = new CloudBillingClient();
const bigquery = new BigQuery();

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET_ID = "boq_dataset";
const PRICING_TABLE_ID = "gcp_pricing_catalog";

// CORS middleware
const corsHandler = cors({ origin: true });

/**
 * Cloud Function to fetch GCP pricing from Cloud Billing API
 */
functions.http("fetchPricing", async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      console.log("Starting pricing fetch operation");

      const { resourceType, region, machineType } = req.query;

      // Fetch pricing data from Cloud Billing API
      const pricingData = await fetchGCPPricing(
        resourceType,
        region,
        machineType
      );

      // Save to BigQuery if requested
      if (req.query.save === "true") {
        await savePricingToBigQuery(pricingData);
      }

      res.status(200).json({
        success: true,
        message: "Pricing data fetched successfully",
        data: pricingData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching pricing:", error);
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
});

/**
 * Fetch pricing data from GCP Cloud Billing API
 */
async function fetchGCPPricing(
  resourceType = "compute",
  region = null,
  machineType = null
) {
  try {
    const request = {
      parent: "services/6F81-5844-456A", // Compute Engine service ID
      pageSize: 5000,
    };

    console.log("Fetching SKUs from Cloud Billing API...");
    const [skus] = await billingClient.listSkus(request);

    const pricingData = [];

    for (const sku of skus) {
      // Filter for compute instances
      if (
        !sku.description.toLowerCase().includes("instance") &&
        !sku.description.toLowerCase().includes("disk") &&
        !sku.description.toLowerCase().includes("gpu")
      ) {
        continue;
      }

      // Apply filters
      if (region && !sku.serviceRegions.includes(region)) {
        continue;
      }

      const pricingInfo = extractPricingInfo(sku);
      if (pricingInfo) {
        pricingData.push(pricingInfo);
      }
    }

    console.log(`Processed ${pricingData.length} pricing records`);
    return pricingData;
  } catch (error) {
    console.error("Error in fetchGCPPricing:", error);
    throw error;
  }
}

/**
 * Extract pricing information from SKU
 */
function extractPricingInfo(sku) {
  try {
    if (!sku.pricingInfo || sku.pricingInfo.length === 0) {
      return null;
    }

    const pricing = sku.pricingInfo[0];
    const pricingExpression = pricing.pricingExpression;

    if (
      !pricingExpression.tieredRates ||
      pricingExpression.tieredRates.length === 0
    ) {
      return null;
    }

    const baseRate = pricingExpression.tieredRates[0];
    const price = baseRate.unitPrice;

    // Convert price to decimal
    const pricePerUnit =
      parseInt(price.nanos) / 1000000000 + (price.units || 0);

    // Extract machine type and resource info from description
    const machineInfo = extractMachineInfo(sku.description);

    return {
      sku_id: sku.skuId,
      sku_name: sku.description,
      service_name: "Compute Engine",
      service_id: "6F81-5844-456A",
      resource_family: machineInfo.resourceFamily,
      resource_group: machineInfo.resourceGroup,
      usage_type: machineInfo.usageType,
      region: sku.serviceRegions.length > 0 ? sku.serviceRegions[0] : null,
      currency_code: price.currencyCode || "USD",
      pricing_unit: pricingExpression.usageUnit,
      price_per_unit: pricePerUnit,
      machine_family: machineInfo.machineFamily,
      machine_type: machineInfo.machineType,
      vcpu_count: machineInfo.vcpuCount,
      memory_gb: machineInfo.memoryGb,
      disk_type: machineInfo.diskType,
      gpu_type: machineInfo.gpuType,
      commitment_term: machineInfo.commitmentTerm,
      effective_date: new Date().toISOString().split("T")[0],
      last_updated: new Date().toISOString(),
      is_active: true,
      validation_status: "valid",
      description: sku.description,
      category: machineInfo.category,
    };
  } catch (error) {
    console.error("Error extracting pricing info:", error);
    return null;
  }
}

/**
 * Extract machine information from SKU description
 */
function extractMachineInfo(description) {
  const info = {
    resourceFamily: "Compute",
    resourceGroup: "Standard",
    usageType: "OnDemand",
    machineFamily: null,
    machineType: null,
    vcpuCount: null,
    memoryGb: null,
    diskType: null,
    gpuType: null,
    commitmentTerm: null,
    category: "compute",
  };

  const desc = description.toLowerCase();

  // Extract machine family (n1, n2, e2, c2, etc.)
  const familyMatch = desc.match(/(n1|n2|n2d|e2|c2|c2d|m1|m2|f1|g1)-/);
  if (familyMatch) {
    info.machineFamily = familyMatch[1];
    info.resourceGroup = familyMatch[1].toUpperCase() + "Standard";
  }

  // Extract full machine type
  const machineMatch = desc.match(
    /(n1|n2|n2d|e2|c2|c2d|m1|m2|f1|g1)-[a-z0-9-]+/
  );
  if (machineMatch) {
    info.machineType = machineMatch[0];
  }

  // Extract vCPU count
  const vcpuMatch = desc.match(/(\d+)\s*vcpu/);
  if (vcpuMatch) {
    info.vcpuCount = parseInt(vcpuMatch[1]);
  }

  // Extract memory
  const memoryMatch = desc.match(/(\d+(?:\.\d+)?)\s*gb/);
  if (memoryMatch) {
    info.memoryGb = parseFloat(memoryMatch[1]);
  }

  // Detect disk types
  if (desc.includes("ssd")) {
    info.diskType = "pd-ssd";
    info.category = "storage";
  } else if (desc.includes("standard")) {
    info.diskType = "pd-standard";
    info.category = "storage";
  } else if (desc.includes("balanced")) {
    info.diskType = "pd-balanced";
    info.category = "storage";
  }

  // Detect GPU
  if (
    desc.includes("gpu") ||
    desc.includes("nvidia") ||
    desc.includes("tesla")
  ) {
    info.category = "gpu";
    const gpuMatch = desc.match(/(nvidia|tesla)[-\s]([a-z0-9]+)/);
    if (gpuMatch) {
      info.gpuType = `${gpuMatch[1]}-${gpuMatch[2]}`;
    }
  }

  // Detect preemptible/spot
  if (desc.includes("preemptible") || desc.includes("spot")) {
    info.usageType = "Preemptible";
  }

  // Detect commitment terms
  if (desc.includes("1 year") || desc.includes("1-year")) {
    info.commitmentTerm = "1-year";
    info.usageType = "Committed";
  } else if (desc.includes("3 year") || desc.includes("3-year")) {
    info.commitmentTerm = "3-year";
    info.usageType = "Committed";
  }

  return info;
}

/**
 * Save pricing data to BigQuery
 */
async function savePricingToBigQuery(pricingData) {
  try {
    const table = bigquery.dataset(DATASET_ID).table(PRICING_TABLE_ID);

    // Insert data in batches
    const batchSize = 1000;
    for (let i = 0; i < pricingData.length; i += batchSize) {
      const batch = pricingData.slice(i, i + batchSize);
      await table.insert(batch);
      console.log(
        `Inserted batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
          pricingData.length / batchSize
        )}`
      );
    }

    console.log(
      `Successfully saved ${pricingData.length} pricing records to BigQuery`
    );
  } catch (error) {
    console.error("Error saving to BigQuery:", error);
    throw error;
  }
}

// Export for testing
module.exports = { fetchGCPPricing, extractPricingInfo, extractMachineInfo };
