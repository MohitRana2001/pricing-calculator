-- BigQuery table schema for BoQ calculation results
-- This table stores the calculated Bill of Quantity results

CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.boq_dataset.gcp_boq_results` (
  -- Calculation metadata
  boq_id STRING NOT NULL OPTIONS(description="Unique identifier for this BoQ calculation"),
  calculation_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP() OPTIONS(description="When the BoQ was calculated"),
  requested_by STRING OPTIONS(description="User who requested the BoQ calculation"),
  
  -- Resource reference
  resource_id STRING NOT NULL OPTIONS(description="Reference to the resource specification"),
  project_id STRING NOT NULL OPTIONS(description="GCP Project ID"),
  instance_name STRING OPTIONS(description="Name of the instance"),
  
  -- Resource details (denormalized for easy reporting)
  machine_type STRING NOT NULL OPTIONS(description="Machine type"),
  vcpu_count INTEGER NOT NULL OPTIONS(description="Number of vCPUs"),
  memory_gb FLOAT64 NOT NULL OPTIONS(description="Memory in GB"),
  disk_type STRING NOT NULL OPTIONS(description="Primary disk type"),
  disk_size_gb INTEGER NOT NULL OPTIONS(description="Primary disk size in GB"),
  region STRING NOT NULL OPTIONS(description="GCP region"),
  pricing_model STRING NOT NULL OPTIONS(description="Applied pricing model"),
  
  -- Usage parameters
  usage_duration_hours INTEGER NOT NULL OPTIONS(description="Usage duration in hours"),
  usage_pattern STRING OPTIONS(description="Usage pattern applied"),
  
  -- Cost breakdown
  compute_cost_usd FLOAT64 NOT NULL OPTIONS(description="Compute instance cost in USD"),
  memory_cost_usd FLOAT64 NOT NULL OPTIONS(description="Memory cost in USD"),
  storage_cost_usd FLOAT64 NOT NULL OPTIONS(description="Storage cost in USD"),
  network_cost_usd FLOAT64 DEFAULT 0 OPTIONS(description="Network cost in USD"),
  gpu_cost_usd FLOAT64 DEFAULT 0 OPTIONS(description="GPU cost in USD if applicable"),
  
  -- Pricing details
  compute_price_per_hour FLOAT64 OPTIONS(description="Compute price per hour"),
  memory_price_per_gb_hour FLOAT64 OPTIONS(description="Memory price per GB-hour"),
  storage_price_per_gb_month FLOAT64 OPTIONS(description="Storage price per GB-month"),
  
  -- Discount information
  sustained_use_discount_percent FLOAT64 DEFAULT 0 OPTIONS(description="Applied SUD percentage"),
  committed_use_discount_percent FLOAT64 DEFAULT 0 OPTIONS(description="Applied CUD percentage"),
  spot_discount_percent FLOAT64 DEFAULT 0 OPTIONS(description="Applied Spot/Preemptible discount"),
  
  -- Total costs
  subtotal_usd FLOAT64 NOT NULL OPTIONS(description="Subtotal before discounts"),
  total_discount_usd FLOAT64 DEFAULT 0 OPTIONS(description="Total discount amount"),
  total_cost_usd FLOAT64 NOT NULL OPTIONS(description="Final total cost in USD"),
  
  -- Additional costs
  additional_storage_costs ARRAY<STRUCT<
    disk_type STRING,
    size_gb INTEGER,
    cost_usd FLOAT64,
    price_per_gb_month FLOAT64
  >> OPTIONS(description="Costs for additional disks"),
  
  -- Metadata
  pricing_date DATE OPTIONS(description="Date when pricing was fetched"),
  calculation_version STRING DEFAULT '1.0' OPTIONS(description="Version of calculation logic used"),
  notes STRING OPTIONS(description="Additional notes or assumptions"),
  
  -- Cost allocation
  cost_center STRING OPTIONS(description="Cost center for billing"),
  environment STRING OPTIONS(description="Environment classification"),
  team STRING OPTIONS(description="Responsible team")
)
PARTITION BY DATE(calculation_timestamp)
CLUSTER BY project_id, region, pricing_model, boq_id
OPTIONS(
  description="Table storing calculated BoQ results with detailed cost breakdown",
  labels=[("team", "cloud-ops"), ("purpose", "cost-management")]
); 