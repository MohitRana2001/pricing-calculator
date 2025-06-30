# GCP Automated BoQ Generation System - Architecture

## Overview

This document describes the architecture and implementation of the comprehensive GCP Automated Bill of Quantity (BoQ) Generation System. The system automates the process of calculating costs for GCP compute instances and VMs with dynamic pricing integration.

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Cloud Run      │    │  Cloud          │
│   (Browser)     │◄──►│  Web App        │◄──►│  Functions      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   BigQuery      │    │  Cloud Billing  │
                       │   Data Store    │    │  API            │
                       └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Cloud Scheduler│    │  Pub/Sub Topic  │
                       │  (Daily Updates)│◄──►│  (Pricing)      │
                       └─────────────────┘    └─────────────────┘
```

## System Components

### 1. BigQuery Data Warehouse

**Purpose**: Central data repository for all BoQ-related data

**Tables**:

- `gcp_resource_specifications`: Stores resource requirements and specifications
- `gcp_boq_results`: Stores calculated BoQ results with detailed cost breakdowns
- `gcp_pricing_catalog`: Caches real-time pricing data from GCP Billing API

**Key Features**:

- Partitioned by date for optimal performance
- Clustered by project, region, and pricing model
- Supports complex queries with nested data structures
- Built-in data retention policies

### 2. Cloud Functions

#### a) Pricing Fetcher (`fetchPricing`)

**Trigger**: HTTP
**Purpose**: Fetches real-time pricing from GCP Cloud Billing API

**Key Features**:

- Extracts pricing for compute instances, storage, GPUs, and network
- Intelligent SKU filtering and categorization
- Automatic machine type and resource detection
- Batch processing for large datasets
- Error handling and fallback mechanisms

**API Endpoints**:

- `GET /?save=true` - Fetch and save pricing to BigQuery
- Supports filtering by `resourceType`, `region`, `machineType`

#### b) BoQ Calculator (`calculateBoQ`)

**Trigger**: HTTP
**Purpose**: Calculates comprehensive BoQ with cost breakdowns

**Key Features**:

- Multi-resource calculation support
- Automatic discount application (SUD, CUD, Spot)
- Detailed cost breakdown by component
- Regional pricing variations
- GPU and additional storage cost calculations

**Input Parameters**:

```json
{
  "projectIds": ["project1", "project2"],
  "resourceIds": ["resource1", "resource2"],
  "regions": ["us-central1", "us-east1"],
  "pricingModels": ["on-demand", "cud-1-year"],
  "requestedBy": "user@example.com"
}
```

#### c) Pricing Updater (`updatePricingCatalog`)

**Trigger**: Pub/Sub (Scheduled)
**Purpose**: Automated daily pricing catalog updates

**Key Features**:

- Scheduled execution via Cloud Scheduler
- Comprehensive pricing data refresh
- Data validation and cleanup
- Historical pricing management
- Update reporting and monitoring

### 3. Cloud Run Web Application

**Purpose**: User-friendly web interface for BoQ generation and management

**Key Pages**:

- **Dashboard**: System overview with statistics and quick actions
- **Resources**: View and manage resource specifications
- **Calculate**: Interactive BoQ calculation interface
- **Results**: View and analyze BoQ results with filtering
- **Pricing**: Browse current pricing catalog

**Technology Stack**:

- Node.js with Express framework
- Handlebars templating engine
- Bootstrap 5 for responsive UI
- Chart.js for data visualization
- Progressive Web App (PWA) features

### 4. Cloud Scheduler

**Purpose**: Automated system maintenance and updates

**Jobs**:

- Daily pricing updates at 2 AM UTC
- Weekly data cleanup and optimization
- Monthly cost analysis reports

### 5. Pub/Sub Messaging

**Purpose**: Event-driven architecture for system coordination

**Topics**:

- `pricing-update-topic`: Triggers pricing catalog updates
- `boq-calculation-topic`: Handles large batch calculations
- `system-alerts-topic`: System monitoring and alerting

## Data Flow

### 1. Resource Specification Input

```
User Input → Web Interface → BigQuery (gcp_resource_specifications)
```

### 2. BoQ Calculation Process

```
1. Web App receives calculation request
2. Calls BoQ Calculator Cloud Function
3. Function fetches resource specs from BigQuery
4. Function queries pricing catalog for current rates
5. Function applies discount calculations
6. Function saves results to BigQuery
7. Results returned to Web App for display
```

### 3. Pricing Updates

```
1. Cloud Scheduler triggers daily job
2. Pub/Sub message sent to pricing updater
3. Function fetches latest pricing from Billing API
4. Function updates pricing catalog in BigQuery
5. Function generates update report
```

## Pricing Model Support

### Supported Pricing Models

1. **On-Demand**: Standard pay-per-use pricing
2. **Committed Use Discounts (CUD)**:
   - 1-year commitment: ~25% discount
   - 3-year commitment: ~37% discount
3. **Sustained Use Discounts (SUD)**: Automatic discounts for sustained usage
4. **Spot/Preemptible VMs**: Up to 60% discount with interruption risk

### Discount Calculation Logic

```javascript
// SUD Calculation
if (usage_hours > 183 && pattern === "continuous") {
  sud_discount = Math.min(30, Math.floor((usage_hours - 183) / 73) * 5);
}

// CUD Calculation
cud_discount = (base_cost * discount_percentage) / 100;

// Spot VM Calculation
spot_discount = base_cost * 0.6; // 60% discount
```

## Security and Access Control

### Service Account Permissions

- `roles/billing.viewer`: Access to pricing information
- `roles/bigquery.dataEditor`: Read/write access to datasets
- `roles/bigquery.jobUser`: Execute BigQuery jobs

### Security Measures

- HTTPS encryption for all communications
- CORS protection with configurable origins
- Rate limiting to prevent abuse
- Input validation and sanitization
- Audit logging for all operations

## Scalability and Performance

### BigQuery Optimization

- Date-based partitioning for time-series data
- Clustering on frequently queried columns
- Materialized views for common aggregations
- Automatic query optimization

### Cloud Functions Scaling

- Automatic scaling based on demand
- Configurable memory and timeout limits
- Connection pooling for database access
- Efficient batch processing

### Caching Strategy

- Pricing data cached for 24 hours
- BigQuery results cached at application level
- CDN caching for static assets

## Monitoring and Observability

### Key Metrics

- Function execution count and duration
- BigQuery slot usage and query performance
- Pricing API call rates and errors
- User activity and BoQ generation frequency

### Alerting

- Function error rates > 5%
- Pricing API failures > 10%
- BigQuery job failures
- Unusual cost calculation patterns

### Logging

- Structured logging with Cloud Logging
- Request/response tracking
- Error context and stack traces
- Performance timing information

## Cost Optimization

### BigQuery Cost Control

- Query optimization for slot usage
- Partitioning to reduce data scanning
- Materialized views for repeated queries
- Data lifecycle management

### Function Cost Control

- Right-sized memory allocation
- Efficient cold start handling
- Connection reuse and pooling
- Batch processing optimization

## Disaster Recovery

### Data Backup

- BigQuery automatic backup and point-in-time recovery
- Cross-region dataset replication
- Function source code in version control

### High Availability

- Multi-region deployment capability
- Automatic failover for Cloud Run
- Function retry and error handling
- Circuit breaker patterns

## API Reference

### BoQ Calculator API

**POST** `/api/calculate`

```json
{
  "projectIds": ["string"],
  "resourceIds": ["string"],
  "regions": ["string"],
  "pricingModels": ["string"],
  "requestedBy": "string"
}
```

**Response**:

```json
{
  "success": true,
  "boq_id": "uuid",
  "resources_processed": 10,
  "summary": {
    "total_cost_usd": 1250.50,
    "total_discount_usd": 125.00,
    "cost_by_project": {...},
    "cost_by_region": {...}
  },
  "results": [...]
}
```

### Pricing Fetcher API

**GET** `/fetchPricing?save=true&region=us-central1`

**Response**:

```json
{
  "success": true,
  "message": "Pricing data fetched successfully",
  "data": [...],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Deployment

### Prerequisites

- GCP Project with billing enabled
- Required APIs enabled
- Service account with proper permissions
- gcloud CLI installed and authenticated

### Quick Deployment

```bash
# Set project
export GCP_PROJECT="your-project-id"

# Run deployment script
cd deployment
./deploy.sh
```

### Manual Deployment Steps

1. Enable required GCP APIs
2. Create service account and assign roles
3. Create BigQuery dataset and tables
4. Deploy Cloud Functions
5. Deploy Cloud Run application
6. Configure Cloud Scheduler
7. Insert sample data

## Usage Examples

### Calculate BoQ for Specific Resources

```bash
curl -X POST "https://your-boq-calculator-url" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceIds": ["prod-web-001", "prod-db-001"],
    "requestedBy": "architect@company.com"
  }'
```

### Fetch Current Pricing

```bash
curl "https://your-pricing-fetcher-url?save=true&region=us-central1"
```

### Query BoQ Results

```sql
SELECT
  project_id,
  SUM(total_cost_usd) as total_cost,
  COUNT(*) as resource_count
FROM `project.boq_dataset.gcp_boq_results`
WHERE DATE(calculation_timestamp) = CURRENT_DATE()
GROUP BY project_id
ORDER BY total_cost DESC;
```

## Customization and Extensions

### Adding New Pricing Models

1. Update pricing model enum in schemas
2. Add calculation logic in BoQ calculator
3. Update UI to support new model
4. Test with sample data

### Supporting Additional GCP Services

1. Add new service IDs to configuration
2. Extend pricing fetcher for new SKUs
3. Update calculation logic
4. Add UI components for new services

### Custom Discount Rules

1. Modify discount calculation functions
2. Add configuration parameters
3. Update UI for discount display
4. Test discount accuracy

## Troubleshooting

### Common Issues

**BigQuery Permission Errors**:

- Verify service account has required roles
- Check dataset and table permissions
- Ensure billing is enabled

**Function Timeout Errors**:

- Increase timeout limits in configuration
- Optimize query performance
- Implement batch processing

**Pricing API Rate Limits**:

- Implement exponential backoff
- Cache pricing data appropriately
- Monitor API usage quotas

**Web App Access Issues**:

- Check Cloud Run service permissions
- Verify environment variables
- Review CORS configuration

## Future Enhancements

### Planned Features

- Support for additional GCP services (Cloud Storage, Load Balancers)
- Advanced forecasting and budget planning
- Custom reporting and export capabilities
- Integration with existing billing systems
- Mobile application support

### Technical Improvements

- GraphQL API for flexible data queries
- Real-time pricing updates via WebSockets
- Machine learning for cost optimization recommendations
- Multi-cloud pricing comparison
- Advanced analytics and visualization
