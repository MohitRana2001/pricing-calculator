-- BigQuery table schema for GCP pricing catalog
-- This table caches pricing information from the Cloud Billing API

CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.boq_dataset.gcp_pricing_catalog` (
  -- SKU identification
  sku_id STRING NOT NULL OPTIONS(description="Unique SKU identifier from Cloud Billing API"),
  sku_name STRING NOT NULL OPTIONS(description="Human-readable SKU name"),
  service_name STRING NOT NULL OPTIONS(description="GCP service name (e.g., Compute Engine)"),
  service_id STRING NOT NULL OPTIONS(description="Service identifier"),
  
  -- Resource classification
  resource_family STRING OPTIONS(description="Resource family (e.g., Compute, Storage)"),
  resource_group STRING OPTIONS(description="Resource group (e.g., N1Standard, E2)"),
  usage_type STRING OPTIONS(description="Usage type (e.g., OnDemand, Preemptible)"),
  
  -- Geographic pricing
  region STRING OPTIONS(description="GCP region for regional pricing"),
  zone STRING OPTIONS(description="Specific zone if applicable"),
  
  -- Pricing information
  currency_code STRING DEFAULT 'USD' OPTIONS(description="Currency code for pricing"),
  pricing_unit STRING NOT NULL OPTIONS(description="Pricing unit (e.g., hour, GB-month)"),
  price_per_unit FLOAT64 NOT NULL OPTIONS(description="Price per unit in the specified currency"),
  
  -- Tiered pricing (for volume discounts)
  tiered_rates ARRAY<STRUCT<
    start_usage_amount INTEGER,
    price_per_unit FLOAT64,
    currency_code STRING
  >> OPTIONS(description="Tiered pricing rates if applicable"),
  
  -- Machine type specifications (for compute resources)
  machine_family STRING OPTIONS(description="Machine family (e.g., n1, e2, c2)"),
  machine_type STRING OPTIONS(description="Specific machine type"),
  vcpu_count INTEGER OPTIONS(description="Number of vCPUs for this machine type"),
  memory_gb FLOAT64 OPTIONS(description="Memory in GB for this machine type"),
  
  -- Storage specifications
  disk_type STRING OPTIONS(description="Disk type (pd-standard, pd-ssd, pd-balanced)"),
  
  -- GPU specifications
  gpu_type STRING OPTIONS(description="GPU type if applicable"),
  
  -- Commitment and discount information
  commitment_term STRING OPTIONS(description="Commitment term (1-year, 3-year)"),
  commitment_type STRING OPTIONS(description="Commitment type (spend, resource)"),
  discount_percent FLOAT64 DEFAULT 0 OPTIONS(description="Discount percentage for committed use"),
  
  -- Network specifications
  network_tier STRING OPTIONS(description="Network service tier (standard, premium)"),
  
  -- Metadata
  effective_date DATE NOT NULL OPTIONS(description="Date when this pricing becomes effective"),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP() OPTIONS(description="When this record was last updated"),
  pricing_source STRING DEFAULT 'cloud-billing-api' OPTIONS(description="Source of pricing information"),
  
  -- Status and validation
  is_active BOOLEAN DEFAULT TRUE OPTIONS(description="Whether this pricing is currently active"),
  validation_status STRING DEFAULT 'valid' OPTIONS(description="Validation status of the pricing data"),
  
  -- Additional metadata
  description STRING OPTIONS(description="Detailed description of the SKU"),
  category STRING OPTIONS(description="Category for grouping (compute, storage, network)"),
  tags ARRAY<STRING> OPTIONS(description="Tags for categorization and filtering")
)
PARTITION BY effective_date
CLUSTER BY service_name, resource_family, region, machine_type
OPTIONS(
  description="Cached pricing catalog from GCP Cloud Billing API",
  labels=[("team", "cloud-ops"), ("purpose", "pricing-cache")]
); 