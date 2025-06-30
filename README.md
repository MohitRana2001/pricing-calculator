# GCP Automated Bill of Quantity (BoQ) Generation System

A comprehensive serverless solution for automating GCP resource cost calculations with dynamic pricing integration.

## Architecture Overview

This system leverages native GCP services to create a fully automated BoQ generation pipeline:

- **BigQuery**: Data warehouse for resource specifications and BoQ results
- **Cloud Functions**: Serverless compute for pricing APIs and calculations
- **Cloud Run**: Scalable web application for user interface
- **Cloud Scheduler**: Automated pricing updates
- **Cloud Billing API**: Real-time pricing data
- **IAM**: Security and access control

## Project Structure

```
├── cloud-functions/          # Serverless functions
│   ├── pricing-fetcher/     # Pricing API integration
│   ├── boq-calculator/      # BoQ calculation logic
│   └── pricing-updater/     # Scheduled pricing updates
├── web-app/                 # Cloud Run web application
├── bigquery/               # Schema definitions and queries
├── deployment/             # Infrastructure as Code
└── config/                 # Configuration files
```

## Key Features

- **Dynamic Pricing**: Real-time pricing from Cloud Billing API
- **Multiple Pricing Models**: On-demand, CUD, SUD, Spot VM support
- **Automated Calculations**: Eliminates manual effort
- **Web Interface**: User-friendly BoQ generation and viewing
- **Scheduled Updates**: Automatic pricing data refresh
- **Scalable Architecture**: Serverless and event-driven

## Quick Start

1. **Prerequisites**:

   - GCP Project with billing enabled
   - Required APIs enabled (Billing, BigQuery, Cloud Functions, Cloud Run)
   - Service account with appropriate permissions

2. **Deploy**:

   ```bash
   ./deployment/deploy.sh
   ```

3. **Access**: Open the Cloud Run URL to use the web interface

## Estimated Time Savings

- **Manual Process**: 2-4 hours per BoQ
- **Automated Process**: 2-5 minutes per BoQ
- **Accuracy Improvement**: 99%+ with real-time pricing
- **Cost Reduction**: Eliminates manual calculation errors

## Security

- Service accounts with minimal required permissions
- IAM-based access control
- Secure API authentication
- Audit logging enabled
