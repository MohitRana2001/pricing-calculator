-- Sample resource specifications for testing the GCP BoQ system
-- Replace ${PROJECT_ID} with your actual project ID before running

INSERT INTO `${PROJECT_ID}.boq_dataset.gcp_resource_specifications`
(
  project_id,
  resource_id,
  instance_name,
  machine_type,
  vcpu_count,
  memory_gb,
  disk_type,
  disk_size_gb,
  region,
  usage_duration_hours,
  usage_pattern,
  pricing_model,
  gpu_type,
  gpu_count,
  network_tier,
  external_ip,
  created_by,
  description,
  cost_center,
  environment,
  team,
  tags
)
VALUES
  -- Production Web Servers
  ('${PROJECT_ID}', 'prod-web-001', 'web-server-prod-1', 'n1-standard-2', 2, 7.5, 'pd-standard', 100, 'us-central1', 730, 'continuous', 'on-demand', NULL, 0, 'standard', true, 'system-admin', 'Production web server - primary', 'engineering', 'prod', 'web-team', ['web', 'production', 'frontend']),
  ('${PROJECT_ID}', 'prod-web-002', 'web-server-prod-2', 'n1-standard-2', 2, 7.5, 'pd-standard', 100, 'us-central1', 730, 'continuous', 'on-demand', NULL, 0, 'standard', true, 'system-admin', 'Production web server - secondary', 'engineering', 'prod', 'web-team', ['web', 'production', 'frontend']),
  
  -- Production Database Servers with CUD
  ('${PROJECT_ID}', 'prod-db-001', 'db-server-prod-main', 'n1-highmem-4', 4, 26, 'pd-ssd', 500, 'us-central1', 730, 'continuous', 'cud-1-year', NULL, 0, 'premium', false, 'dba-team', 'Production database server - main', 'engineering', 'prod', 'db-team', ['database', 'production', 'mysql']),
  ('${PROJECT_ID}', 'prod-db-002', 'db-server-prod-replica', 'n1-highmem-4', 4, 26, 'pd-ssd', 500, 'us-east1', 730, 'continuous', 'cud-1-year', NULL, 0, 'premium', false, 'dba-team', 'Production database server - replica', 'engineering', 'prod', 'db-team', ['database', 'production', 'mysql', 'replica']),
  
  -- Development and Testing Environments
  ('${PROJECT_ID}', 'dev-web-001', 'web-server-dev', 'e2-medium', 1, 4, 'pd-standard', 50, 'us-central1', 200, 'intermittent', 'on-demand', NULL, 0, 'standard', true, 'dev-team', 'Development web server', 'engineering', 'dev', 'web-team', ['web', 'development']),
  ('${PROJECT_ID}', 'test-api-001', 'api-server-test', 'n1-standard-1', 1, 3.75, 'pd-standard', 30, 'us-central1', 100, 'scheduled', 'on-demand', NULL, 0, 'standard', false, 'qa-team', 'API testing server', 'engineering', 'test', 'api-team', ['api', 'testing']),
  
  -- Batch Processing with Spot VMs
  ('${PROJECT_ID}', 'batch-001', 'batch-worker-1', 'n1-standard-4', 4, 15, 'pd-standard', 100, 'us-central1', 168, 'intermittent', 'spot', NULL, 0, 'standard', false, 'data-team', 'Batch processing worker - ETL jobs', 'data-analytics', 'prod', 'data-team', ['batch', 'etl', 'spot']),
  ('${PROJECT_ID}', 'batch-002', 'batch-worker-2', 'n1-standard-4', 4, 15, 'pd-standard', 100, 'us-west1', 168, 'intermittent', 'spot', NULL, 0, 'standard', false, 'data-team', 'Batch processing worker - analytics', 'data-analytics', 'prod', 'data-team', ['batch', 'analytics', 'spot']),
  
  -- Machine Learning with GPUs
  ('${PROJECT_ID}', 'ml-train-001', 'ml-training-gpu', 'n1-standard-8', 8, 30, 'pd-ssd', 200, 'us-central1', 100, 'scheduled', 'on-demand', 'nvidia-tesla-v100', 1, 'premium', false, 'ml-team', 'ML model training with GPU acceleration', 'research', 'dev', 'ml-team', ['ml', 'gpu', 'training']),
  ('${PROJECT_ID}', 'ml-infer-001', 'ml-inference-server', 'n1-standard-2', 2, 7.5, 'pd-ssd', 50, 'us-central1', 730, 'continuous', 'on-demand', 'nvidia-tesla-t4', 1, 'premium', true, 'ml-team', 'ML inference serving', 'research', 'prod', 'ml-team', ['ml', 'gpu', 'inference']),
  
  -- Memory-Optimized Workloads with 3-year CUD
  ('${PROJECT_ID}', 'cache-001', 'redis-cache-cluster', 'n1-highmem-2', 2, 13, 'pd-ssd', 100, 'us-central1', 730, 'continuous', 'cud-3-year', NULL, 0, 'premium', false, 'platform-team', 'Redis cache cluster node', 'platform', 'prod', 'platform-team', ['cache', 'redis', 'memory']),
  
  -- Compute-Optimized for CPU-intensive tasks
  ('${PROJECT_ID}', 'cpu-001', 'compute-intensive-1', 'c2-standard-8', 8, 32, 'pd-balanced', 200, 'us-central1', 400, 'scheduled', 'on-demand', NULL, 0, 'standard', false, 'compute-team', 'CPU-intensive computation server', 'research', 'dev', 'compute-team', ['compute', 'cpu-intensive']),
  
  -- Regional deployment across multiple zones
  ('${PROJECT_ID}', 'region-eu-001', 'web-server-eu', 'n1-standard-2', 2, 7.5, 'pd-standard', 100, 'europe-west1', 730, 'continuous', 'on-demand', NULL, 0, 'standard', true, 'global-team', 'European web server', 'global-ops', 'prod', 'web-team', ['web', 'global', 'europe']),
  ('${PROJECT_ID}', 'region-asia-001', 'web-server-asia', 'n1-standard-2', 2, 7.5, 'pd-standard', 100, 'asia-southeast1', 730, 'continuous', 'on-demand', NULL, 0, 'standard', true, 'global-team', 'Asian web server', 'global-ops', 'prod', 'web-team', ['web', 'global', 'asia']),
  
  -- Development environments with smaller instances
  ('${PROJECT_ID}', 'dev-micro-001', 'dev-micro-service', 'f1-micro', 1, 0.6, 'pd-standard', 20, 'us-central1', 100, 'intermittent', 'on-demand', NULL, 0, 'standard', false, 'dev-team', 'Micro development environment', 'engineering', 'dev', 'dev-team', ['microservice', 'development']),
  ('${PROJECT_ID}', 'staging-001', 'staging-app-server', 'n1-standard-1', 1, 3.75, 'pd-standard', 50, 'us-central1', 200, 'scheduled', 'on-demand', NULL, 0, 'standard', true, 'qa-team', 'Staging application server', 'engineering', 'staging', 'qa-team', ['staging', 'qa']);

-- Insert additional storage configurations for some resources
INSERT INTO `${PROJECT_ID}.boq_dataset.gcp_resource_specifications`
(
  project_id,
  resource_id,
  instance_name,
  machine_type,
  vcpu_count,
  memory_gb,
  disk_type,
  disk_size_gb,
  additional_disks,
  region,
  usage_duration_hours,
  usage_pattern,
  pricing_model,
  created_by,
  description,
  cost_center,
  environment,
  team,
  tags
)
VALUES
  -- Database server with additional storage
  ('${PROJECT_ID}', 'db-storage-001', 'db-with-additional-storage', 'n1-highmem-8', 8, 52, 'pd-ssd', 100, 
   [STRUCT('pd-ssd' as disk_type, 1000 as size_gb, 'Database data volume' as description),
    STRUCT('pd-standard' as disk_type, 500 as size_gb, 'Database backup volume' as description)],
   'us-central1', 730, 'continuous', 'cud-1-year', 'dba-team', 
   'Database server with additional storage volumes', 'engineering', 'prod', 'db-team', 
   ['database', 'high-storage', 'production']);

-- Create some sample data for different cost centers and teams
INSERT INTO `${PROJECT_ID}.boq_dataset.gcp_resource_specifications`
(project_id, resource_id, instance_name, machine_type, vcpu_count, memory_gb, disk_type, disk_size_gb, region, usage_duration_hours, pricing_model, created_by, description, cost_center, environment, team)
VALUES
  -- Marketing team resources
  ('${PROJECT_ID}', 'marketing-001', 'analytics-dashboard', 'n1-standard-2', 2, 7.5, 'pd-standard', 100, 'us-central1', 500, 'on-demand', 'marketing-ops', 'Marketing analytics dashboard', 'marketing', 'prod', 'marketing-team'),
  
  -- Sales team CRM
  ('${PROJECT_ID}', 'sales-crm-001', 'crm-application', 'n1-standard-4', 4, 15, 'pd-ssd', 200, 'us-central1', 730, 'cud-1-year', 'sales-ops', 'CRM application server', 'sales', 'prod', 'sales-team'),
  
  -- HR systems
  ('${PROJECT_ID}', 'hr-001', 'hr-portal', 'e2-medium', 1, 4, 'pd-standard', 50, 'us-central1', 300, 'on-demand', 'hr-admin', 'HR portal and systems', 'human-resources', 'prod', 'hr-team'),
  
  -- Finance applications
  ('${PROJECT_ID}', 'finance-001', 'financial-reporting', 'n1-highmem-2', 2, 13, 'pd-ssd', 100, 'us-central1', 400, 'on-demand', 'finance-admin', 'Financial reporting system', 'finance', 'prod', 'finance-team');

-- Add some timestamp variations to show data over time
UPDATE `${PROJECT_ID}.boq_dataset.gcp_resource_specifications`
SET created_at = TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL CAST(RAND() * 30 AS INT64) DAY)
WHERE resource_id LIKE '%-001';

UPDATE `${PROJECT_ID}.boq_dataset.gcp_resource_specifications`
SET created_at = TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL CAST(RAND() * 7 AS INT64) DAY)
WHERE resource_id LIKE '%-002'; 