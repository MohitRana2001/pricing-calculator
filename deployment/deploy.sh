#!/bin/bash

# GCP Automated BoQ Generation System Deployment Script
# This script deploys the complete system to Google Cloud Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
DATASET_ID="boq_dataset"
SERVICE_ACCOUNT_NAME="boq-system-sa"
BUCKET_NAME="${PROJECT_ID}-boq-system"

# Function URLs (will be populated after deployment)
PRICING_FETCHER_URL=""
BOQ_CALCULATOR_URL=""
PRICING_UPDATER_TOPIC="pricing-update-topic"

echo -e "${BLUE}🚀 Starting GCP BoQ System Deployment${NC}"
echo -e "${BLUE}Project ID: ${PROJECT_ID}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}"
echo ""

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found. Please install and authenticate.${NC}"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ No project ID found. Set GCP_PROJECT or run 'gcloud config set project PROJECT_ID'${NC}"
    exit 1
fi

echo -e "${YELLOW}📝 Step 1: Enabling required APIs...${NC}"
gcloud services enable \
    cloudbilling.googleapis.com \
    bigquery.googleapis.com \
    cloudfunctions.googleapis.com \
    run.googleapis.com \
    cloudscheduler.googleapis.com \
    pubsub.googleapis.com \
    storage.googleapis.com \
    iam.googleapis.com \
    --project="$PROJECT_ID"

echo -e "${GREEN}✅ APIs enabled${NC}"

echo -e "${YELLOW}📝 Step 2: Creating service account...${NC}"
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" &>/dev/null; then
    gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
        --display-name="BoQ System Service Account" \
        --description="Service account for the GCP BoQ generation system" \
        --project="$PROJECT_ID"
fi

# Grant necessary permissions
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/billing.viewer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/bigquery.jobUser"

echo -e "${GREEN}✅ Service account created and configured${NC}"

echo -e "${YELLOW}📝 Step 3: Creating BigQuery dataset and tables...${NC}"

# Create dataset
if ! bq show --project_id="$PROJECT_ID" "$DATASET_ID" &>/dev/null; then
    bq mk --project_id="$PROJECT_ID" \
        --description="Dataset for GCP BoQ generation system" \
        --label="team:cloud-ops,purpose:cost-management" \
        "$DATASET_ID"
fi

# Create tables from schema files
for schema_file in ../bigquery/schemas/*.sql; do
    if [ -f "$schema_file" ]; then
        echo "Creating table from $schema_file..."
        # Replace PROJECT_ID placeholder and execute
        sed "s/\${PROJECT_ID}/$PROJECT_ID/g" "$schema_file" | bq query \
            --project_id="$PROJECT_ID" \
            --use_legacy_sql=false
    fi
done

echo -e "${GREEN}✅ BigQuery dataset and tables created${NC}"

echo -e "${YELLOW}📝 Step 4: Creating Pub/Sub topic for pricing updates...${NC}"
if ! gcloud pubsub topics describe "$PRICING_UPDATER_TOPIC" --project="$PROJECT_ID" &>/dev/null; then
    gcloud pubsub topics create "$PRICING_UPDATER_TOPIC" --project="$PROJECT_ID"
fi

echo -e "${GREEN}✅ Pub/Sub topic created${NC}"

echo -e "${YELLOW}📝 Step 5: Deploying Cloud Functions...${NC}"

# Deploy pricing fetcher
echo "Deploying pricing fetcher..."
cd ../cloud-functions/pricing-fetcher
gcloud functions deploy fetchPricing \
    --runtime=nodejs18 \
    --trigger=http \
    --allow-unauthenticated \
    --memory=256MB \
    --timeout=60s \
    --region="$REGION" \
    --service-account="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-env-vars="GCP_PROJECT=$PROJECT_ID" \
    --project="$PROJECT_ID"

PRICING_FETCHER_URL=$(gcloud functions describe fetchPricing --region="$REGION" --project="$PROJECT_ID" --format="value(httpsTrigger.url)")

# Deploy BoQ calculator
echo "Deploying BoQ calculator..."
cd ../boq-calculator
gcloud functions deploy calculateBoQ \
    --runtime=nodejs18 \
    --trigger=http \
    --allow-unauthenticated \
    --memory=512MB \
    --timeout=300s \
    --region="$REGION" \
    --service-account="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-env-vars="GCP_PROJECT=$PROJECT_ID" \
    --project="$PROJECT_ID"

BOQ_CALCULATOR_URL=$(gcloud functions describe calculateBoQ --region="$REGION" --project="$PROJECT_ID" --format="value(httpsTrigger.url)")

# Deploy pricing updater
echo "Deploying pricing updater..."
cd ../pricing-updater
gcloud functions deploy updatePricingCatalog \
    --runtime=nodejs18 \
    --trigger-topic="$PRICING_UPDATER_TOPIC" \
    --memory=512MB \
    --timeout=540s \
    --region="$REGION" \
    --service-account="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-env-vars="GCP_PROJECT=$PROJECT_ID" \
    --project="$PROJECT_ID"

echo -e "${GREEN}✅ Cloud Functions deployed${NC}"

echo -e "${YELLOW}📝 Step 6: Deploying web application to Cloud Run...${NC}"
cd ../../web-app

gcloud run deploy boq-web-app \
    --source=. \
    --platform=managed \
    --region="$REGION" \
    --allow-unauthenticated \
    --service-account="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-env-vars="GCP_PROJECT=$PROJECT_ID,BOQ_CALCULATOR_URL=$BOQ_CALCULATOR_URL,PRICING_FETCHER_URL=$PRICING_FETCHER_URL" \
    --memory=1Gi \
    --cpu=1 \
    --timeout=300 \
    --max-instances=10 \
    --project="$PROJECT_ID"

WEB_APP_URL=$(gcloud run services describe boq-web-app --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)")

echo -e "${GREEN}✅ Web application deployed${NC}"

echo -e "${YELLOW}📝 Step 7: Setting up Cloud Scheduler for pricing updates...${NC}"

# Create scheduler job for daily pricing updates
if ! gcloud scheduler jobs describe pricing-daily-update --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
    gcloud scheduler jobs create pubsub pricing-daily-update \
        --location="$REGION" \
        --schedule="0 2 * * *" \
        --topic="$PRICING_UPDATER_TOPIC" \
        --message-body='{"trigger":"scheduled"}' \
        --description="Daily pricing catalog update" \
        --project="$PROJECT_ID"
fi

echo -e "${GREEN}✅ Cloud Scheduler configured${NC}"

echo -e "${YELLOW}📝 Step 8: Initial pricing data population...${NC}"
echo "Triggering initial pricing fetch..."

curl -X GET "${PRICING_FETCHER_URL}?save=true" || {
    echo -e "${YELLOW}⚠️  Initial pricing fetch failed. You can run it manually from the web interface.${NC}"
}

echo -e "${GREEN}✅ Initial setup complete${NC}"

echo -e "${YELLOW}📝 Step 9: Creating sample resource specifications...${NC}"
cd ../deployment

# Insert sample data
bq query \
    --project_id="$PROJECT_ID" \
    --use_legacy_sql=false \
    --format=none \
    <<EOF
INSERT INTO \`$PROJECT_ID.$DATASET_ID.gcp_resource_specifications\`
(project_id, resource_id, instance_name, machine_type, vcpu_count, memory_gb, disk_type, disk_size_gb, region, usage_duration_hours, pricing_model, created_by, description, environment, team)
VALUES
  ('$PROJECT_ID', 'sample-vm-1', 'web-server-prod', 'n1-standard-2', 2, 7.5, 'pd-standard', 100, 'us-central1', 730, 'on-demand', 'deployment-script', 'Production web server', 'prod', 'web-team'),
  ('$PROJECT_ID', 'sample-vm-2', 'db-server-prod', 'n1-highmem-4', 4, 26, 'pd-ssd', 500, 'us-central1', 730, 'cud-1-year', 'deployment-script', 'Production database server', 'prod', 'db-team'),
  ('$PROJECT_ID', 'sample-vm-3', 'batch-worker', 'n1-standard-1', 1, 3.75, 'pd-standard', 50, 'us-central1', 168, 'spot', 'deployment-script', 'Batch processing worker', 'dev', 'data-team'),
  ('$PROJECT_ID', 'sample-vm-4', 'ml-training', 'n1-standard-8', 8, 30, 'pd-ssd', 200, 'us-central1', 100, 'on-demand', 'deployment-script', 'Machine learning training instance', 'dev', 'ml-team');
EOF

echo -e "${GREEN}✅ Sample data created${NC}"

echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo -e "${BLUE}📊 System URLs:${NC}"
echo -e "${BLUE}Web Application: ${WEB_APP_URL}${NC}"
echo -e "${BLUE}Pricing Fetcher: ${PRICING_FETCHER_URL}${NC}"
echo -e "${BLUE}BoQ Calculator: ${BOQ_CALCULATOR_URL}${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo -e "1. Visit the web application: ${WEB_APP_URL}"
echo -e "2. Review the sample resource specifications"
echo -e "3. Calculate your first BoQ"
echo -e "4. The pricing catalog will update daily at 2 AM UTC"
echo ""
echo -e "${BLUE}💡 Key Features:${NC}"
echo -e "- Real-time pricing from GCP Billing API"
echo -e "- Support for multiple pricing models (On-demand, CUD, Spot)"
echo -e "- Automated discount calculations (SUD, CUD, Spot)"
echo -e "- Web interface for easy BoQ generation"
echo -e "- Scheduled pricing updates"
echo ""
echo -e "${YELLOW}⚠️  Security Note:${NC}"
echo -e "The web application is deployed with --allow-unauthenticated for demonstration."
echo -e "For production use, configure proper authentication and access controls."
echo ""

# Save configuration
cat > deployment-config.json <<EOF
{
  "project_id": "$PROJECT_ID",
  "region": "$REGION",
  "dataset_id": "$DATASET_ID",
  "service_account": "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com",
  "web_app_url": "$WEB_APP_URL",
  "pricing_fetcher_url": "$PRICING_FETCHER_URL",
  "boq_calculator_url": "$BOQ_CALCULATOR_URL",
  "pricing_updater_topic": "$PRICING_UPDATER_TOPIC",
  "deployment_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo -e "${GREEN}✅ Configuration saved to deployment-config.json${NC}" 