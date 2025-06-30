const functions = require("@google-cloud/functions-framework");
const { CloudBillingClient } = require("@google-cloud/billing");
const { BigQuery } = require("@google-cloud/bigquery");

// Initialize clients
const billingClient = new CloudBillingClient();
const bigquery = new BigQuery();

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET_ID = "boq_dataset";
const PRICING_TABLE_ID = "gcp_pricing_catalog";

// GCP Service IDs
const SERVICE_IDS = {
  COMPUTE_ENGINE: "6F81-5844-456A",
  CLOUD_STORAGE: "95FF-2EF5-5EA1",
  BIGQUERY: "24E6-581D-38E5",
};

/**
 * Cloud Function triggered by Pub/Sub to update pricing catalog
 */
functions.cloudEvent("updatePricingCatalog", async (cloudEvent) => {
  try {
    console.log("Starting scheduled pricing catalog update");

    // Get current timestamp for this update
    const updateTimestamp = new Date().toISOString();
    const effectiveDate = new Date().toISOString().split("T")[0];

    console.log(`Update timestamp: ${updateTimestamp}`);

    // Fetch pricing for all relevant services
    const allPricingData = [];

    // Update Compute Engine pricing
    console.log("Updating Compute Engine pricing...");
    const computePricing = await fetchServicePricing(
      SERVICE_IDS.COMPUTE_ENGINE,
      "Compute Engine"
    );
    allPricingData.push(...computePricing);

    console.log(
      `Fetched ${computePricing.length} Compute Engine pricing records`
    );

    // Mark existing pricing as inactive before inserting new data
    await markExistingPricingInactive(effectiveDate);

    // Insert new pricing data
    if (allPricingData.length > 0) {
      await insertPricingData(allPricingData);
    }

    // Clean up old pricing data (older than 90 days)
    await cleanupOldPricingData();

    // Generate update report
    const report = await generateUpdateReport(
      effectiveDate,
      allPricingData.length
    );

    console.log("Pricing catalog update completed successfully");
    console.log("Update Report:", JSON.stringify(report, null, 2));

    return {
      success: true,
      message: "Pricing catalog updated successfully",
      timestamp: updateTimestamp,
      records_updated: allPricingData.length,
      report: report,
    };
  } catch (error) {
    console.error("Error updating pricing catalog:", error);
    throw error;
  }
});

/**
 * Fetch pricing data for a specific service
 */
async function fetchServicePricing(serviceId, serviceName) {
  try {
    const request = {
      parent: `services/${serviceId}`,
      pageSize: 5000,
    };

    console.log(`Fetching SKUs for ${serviceName}...`);
    const [skus] = await billingClient.listSkus(request);

    const pricingData = [];
    let processedCount = 0;

    for (const sku of skus) {
      // Filter relevant SKUs (compute instances, storage, GPUs)
      if (!isRelevantSku(sku)) {
        continue;
      }

      const pricingInfo = extractPricingInfo(sku, serviceName, serviceId);
      if (pricingInfo) {
        pricingData.push(pricingInfo);
        processedCount++;
      }

      // Log progress for large datasets
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount} SKUs for ${serviceName}`);
      }
    }

    console.log(
      `Completed processing ${pricingData.length} relevant SKUs for ${serviceName}`
    );
    return pricingData;
  } catch (error) {
    console.error(`Error fetching pricing for ${serviceName}:`, error);
    return [];
  }
}

/**
 * Check if SKU is relevant for BoQ calculations
 */
function isRelevantSku(sku) {
  const description = sku.description.toLowerCase();

  // Include compute instances, storage, and GPUs
  const relevantKeywords = [
    "instance",
    "vm",
    "virtual machine",
    "disk",
    "storage",
    "persistent",
    "gpu",
    "nvidia",
    "tesla",
    "ip address",
    "network",
    "memory",
    "cpu",
    "core",
  ];

  // Exclude irrelevant items
  const excludeKeywords = [
    "license",
    "support",
    "premium support",
    "api",
    "monitoring",
    "logging",
    "backup",
    "snapshot transfer",
  ];

  const hasRelevantKeyword = relevantKeywords.some((keyword) =>
    description.includes(keyword)
  );
  const hasExcludeKeyword = excludeKeywords.some((keyword) =>
    description.includes(keyword)
  );

  return hasRelevantKeyword && !hasExcludeKeyword;
}

/**
 * Extract pricing information from SKU
 */
function extractPricingInfo(sku, serviceName, serviceId) {
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
      parseInt(price.nanos || 0) / 1000000000 + parseInt(price.units || 0);

    // Skip free tier items
    if (pricePerUnit === 0) {
      return null;
    }

    // Extract machine type and resource info from description
    const machineInfo = extractMachineInfo(sku.description);

    // Build tiered rates if available
    const tieredRates = pricingExpression.tieredRates.map((rate) => ({
      start_usage_amount: parseInt(rate.startUsageAmount || 0),
      price_per_unit:
        parseInt(rate.unitPrice.nanos || 0) / 1000000000 +
        parseInt(rate.unitPrice.units || 0),
      currency_code: rate.unitPrice.currencyCode || "USD",
    }));

    return {
      sku_id: sku.skuId,
      sku_name: sku.description,
      service_name: serviceName,
      service_id: serviceId,
      resource_family: machineInfo.resourceFamily,
      resource_group: machineInfo.resourceGroup,
      usage_type: machineInfo.usageType,
      region:
        sku.serviceRegions && sku.serviceRegions.length > 0
          ? sku.serviceRegions[0]
          : null,
      currency_code: price.currencyCode || "USD",
      pricing_unit: pricingExpression.usageUnit,
      price_per_unit: pricePerUnit,
      tiered_rates: tieredRates.length > 1 ? tieredRates : null,
      machine_family: machineInfo.machineFamily,
      machine_type: machineInfo.machineType,
      vcpu_count: machineInfo.vcpuCount,
      memory_gb: machineInfo.memoryGb,
      disk_type: machineInfo.diskType,
      gpu_type: machineInfo.gpuType,
      commitment_term: machineInfo.commitmentTerm,
      commitment_type: machineInfo.commitmentType,
      discount_percent: machineInfo.discountPercent,
      network_tier: machineInfo.networkTier,
      effective_date: new Date().toISOString().split("T")[0],
      last_updated: new Date().toISOString(),
      pricing_source: "cloud-billing-api",
      is_active: true,
      validation_status: "valid",
      description: sku.description,
      category: machineInfo.category,
      tags: machineInfo.tags,
    };
  } catch (error) {
    console.error("Error extracting pricing info for SKU:", sku.skuId, error);
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
    commitmentType: null,
    discountPercent: 0,
    networkTier: null,
    category: "compute",
    tags: [],
  };

  const desc = description.toLowerCase();

  // Extract machine family and type
  const familyMatch = desc.match(
    /(n1|n2|n2d|e2|c2|c2d|m1|m2|f1|g1|a2|t2d|t2a)-/
  );
  if (familyMatch) {
    info.machineFamily = familyMatch[1];
    info.resourceGroup = familyMatch[1].toUpperCase() + "Standard";
    info.tags.push(`family:${familyMatch[1]}`);
  }

  const machineMatch = desc.match(
    /(n1|n2|n2d|e2|c2|c2d|m1|m2|f1|g1|a2|t2d|t2a)-[a-z0-9-]+/
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

  // Detect categories and types
  if (desc.includes("ssd")) {
    info.diskType = "pd-ssd";
    info.category = "storage";
    info.tags.push("storage:ssd");
  } else if (desc.includes("balanced")) {
    info.diskType = "pd-balanced";
    info.category = "storage";
    info.tags.push("storage:balanced");
  } else if (desc.includes("standard")) {
    if (desc.includes("disk") || desc.includes("storage")) {
      info.diskType = "pd-standard";
      info.category = "storage";
      info.tags.push("storage:standard");
    }
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
      info.tags.push(`gpu:${info.gpuType}`);
    }
  }

  // Detect usage types
  if (desc.includes("preemptible") || desc.includes("spot")) {
    info.usageType = "Preemptible";
    info.tags.push("usage:preemptible");
  }

  // Detect commitment terms
  if (desc.includes("1 year") || desc.includes("1-year")) {
    info.commitmentTerm = "1-year";
    info.usageType = "Committed";
    info.commitmentType = "resource";
    info.discountPercent = 25;
    info.tags.push("commitment:1-year");
  } else if (desc.includes("3 year") || desc.includes("3-year")) {
    info.commitmentTerm = "3-year";
    info.usageType = "Committed";
    info.commitmentType = "resource";
    info.discountPercent = 37;
    info.tags.push("commitment:3-year");
  }

  // Detect network tiers
  if (desc.includes("premium")) {
    info.networkTier = "premium";
    info.category = "network";
    info.tags.push("network:premium");
  } else if (desc.includes("standard")) {
    if (
      desc.includes("network") ||
      desc.includes("egress") ||
      desc.includes("ip")
    ) {
      info.networkTier = "standard";
      info.category = "network";
      info.tags.push("network:standard");
    }
  }

  // Regional vs global
  if (desc.includes("regional")) {
    info.tags.push("scope:regional");
  } else if (desc.includes("global")) {
    info.tags.push("scope:global");
  }

  return info;
}

/**
 * Mark existing pricing as inactive
 */
async function markExistingPricingInactive(effectiveDate) {
  try {
    const query = `
      UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PRICING_TABLE_ID}\`
      SET is_active = false,
          last_updated = CURRENT_TIMESTAMP()
      WHERE is_active = true
        AND effective_date < @effectiveDate
    `;

    const [job] = await bigquery.createQueryJob({
      query: query,
      params: { effectiveDate },
    });

    await job.getQueryResults();
    console.log("Marked existing pricing as inactive");
  } catch (error) {
    console.error("Error marking existing pricing inactive:", error);
    // Don't fail the entire update for this
  }
}

/**
 * Insert new pricing data into BigQuery
 */
async function insertPricingData(pricingData) {
  try {
    const table = bigquery.dataset(DATASET_ID).table(PRICING_TABLE_ID);

    // Insert in batches to avoid timeout
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

    console.log(`Successfully inserted ${pricingData.length} pricing records`);
  } catch (error) {
    console.error("Error inserting pricing data:", error);
    throw error;
  }
}

/**
 * Clean up old pricing data
 */
async function cleanupOldPricingData() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // Keep 90 days
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

    const query = `
      DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.${PRICING_TABLE_ID}\`
      WHERE effective_date < @cutoffDate
        AND is_active = false
    `;

    const [job] = await bigquery.createQueryJob({
      query: query,
      params: { cutoffDate: cutoffDateStr },
    });

    const [rows] = await job.getQueryResults();
    console.log("Cleaned up old pricing data");
  } catch (error) {
    console.error("Error cleaning up old pricing data:", error);
    // Don't fail for cleanup errors
  }
}

/**
 * Generate update report
 */
async function generateUpdateReport(effectiveDate, totalRecords) {
  try {
    const query = `
      SELECT 
        category,
        service_name,
        COUNT(*) as record_count,
        AVG(price_per_unit) as avg_price,
        MIN(price_per_unit) as min_price,
        MAX(price_per_unit) as max_price
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PRICING_TABLE_ID}\`
      WHERE effective_date = @effectiveDate
        AND is_active = true
      GROUP BY category, service_name
      ORDER BY category, service_name
    `;

    const [rows] = await bigquery.query({
      query: query,
      params: { effectiveDate },
    });

    return {
      effective_date: effectiveDate,
      total_records: totalRecords,
      categories: rows,
      update_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating update report:", error);
    return {
      effective_date: effectiveDate,
      total_records: totalRecords,
      error: error.message,
    };
  }
}

// Export for testing
module.exports = {
  fetchServicePricing,
  extractPricingInfo,
  extractMachineInfo,
  isRelevantSku,
};
