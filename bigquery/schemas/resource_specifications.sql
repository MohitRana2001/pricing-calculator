-- BigQuery table schema for GCP resource specifications
-- This table stores the raw GCP resource data used for BoQ generation

CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.boq_dataset.gcp_resource_specifications` (
  -- Primary identifiers
  project_id STRING NOT NULL OPTIONS(description="GCP Project ID where the resource exists"),
  resource_id STRING NOT NULL OPTIONS(description="Unique identifier for the resource"),
  instance_name STRING OPTIONS(description="Name of the Compute Engine instance"),
  
  -- Resource specifications
  machine_type STRING NOT NULL OPTIONS(description="Machine type (e.g., n1-standard-1, e2-medium)"),
  vcpu_count INTEGER NOT NULL OPTIONS(description="Number of virtual CPUs"),
  memory_gb FLOAT64 NOT NULL OPTIONS(description="Amount of memory in GB"),
  
  -- Storage specifications
  disk_type STRING NOT NULL OPTIONS(description="Type of disk (pd-standard, pd-ssd, pd-balanced)"),
  disk_size_gb INTEGER NOT NULL OPTIONS(description="Size of boot disk in GB"),
  additional_disks ARRAY<STRUCT<
    disk_type STRING,
    size_gb INTEGER,
    description STRING
  >> OPTIONS(description="Additional persistent disks attached"),
  
  -- Location and availability
  region STRING NOT NULL OPTIONS(description="GCP region (e.g., us-central1, europe-west1)"),
  zone STRING OPTIONS(description="Specific zone within the region"),
  
  -- Usage parameters
  usage_duration_hours INTEGER NOT NULL OPTIONS(description="Expected usage duration in hours"),
  usage_pattern STRING DEFAULT 'continuous' OPTIONS(description="Usage pattern: continuous, intermittent, scheduled"),
  
  -- Pricing model
  pricing_model STRING NOT NULL DEFAULT 'on-demand' OPTIONS(description="Pricing model: on-demand, cud-1-year, cud-3-year, spot, preemptible"),
  commitment_type STRING OPTIONS(description="For CUD: standard, memory-optimized, compute-optimized"),
  
  -- Optional GPU specifications
  gpu_type STRING OPTIONS(description="GPU type if applicable (e.g., nvidia-tesla-v100)"),
  gpu_count INTEGER DEFAULT 0 OPTIONS(description="Number of GPUs attached"),
  
  -- Network specifications
  network_tier STRING DEFAULT 'standard' OPTIONS(description="Network service tier: standard, premium"),
  external_ip BOOLEAN DEFAULT FALSE OPTIONS(description="Whether external IP is required"),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP() OPTIONS(description="Record creation timestamp"),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP() OPTIONS(description="Record last update timestamp"),
  created_by STRING OPTIONS(description="User who created the record"),
  tags ARRAY<STRING> OPTIONS(description="Resource tags for categorization"),
  description STRING OPTIONS(description="Human-readable description of the resource"),
  
  -- Cost center and billing
  cost_center STRING OPTIONS(description="Cost center for billing allocation"),
  environment STRING OPTIONS(description="Environment: dev, staging, prod"),
  team STRING OPTIONS(description="Team responsible for the resource")
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id, region, pricing_model
OPTIONS(
  description="Table storing GCP resource specifications for BoQ generation",
  labels=[("team", "cloud-ops"), ("purpose", "cost-management")]
); 