const express = require("express");
const { engine } = require("express-handlebars");
const { BigQuery } = require("@google-cloud/bigquery");
const axios = require("axios");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Initialize app
const app = express();
const PORT = process.env.PORT || 8080;

// Initialize BigQuery client
const bigquery = new BigQuery();

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET_ID = "boq_dataset";
const BOQ_CALCULATOR_URL = process.env.BOQ_CALCULATOR_URL;
const PRICING_FETCHER_URL = process.env.PRICING_FETCHER_URL;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Handlebars setup
app.engine(
  "handlebars",
  engine({
    defaultLayout: "main",
    helpers: {
      json: function (context) {
        return JSON.stringify(context);
      },
      currency: function (value) {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value || 0);
      },
      round: function (value, decimals = 2) {
        return Number(value || 0).toFixed(decimals);
      },
      formatDate: function (date) {
        return new Date(date).toLocaleDateString();
      },
      eq: function (a, b) {
        return a === b;
      },
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

// Routes

// Home page
app.get("/", async (req, res) => {
  try {
    // Get summary statistics
    const stats = await getDashboardStats();
    res.render("dashboard", {
      title: "GCP BoQ Dashboard",
      stats: stats,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.render("dashboard", {
      title: "GCP BoQ Dashboard",
      error: "Unable to load dashboard statistics",
    });
  }
});

// Resource specifications page
app.get("/resources", async (req, res) => {
  try {
    const { project, region, page = 1 } = req.query;
    const limit = 50;
    const offset = (page - 1) * limit;

    const resources = await getResourceSpecifications({
      project,
      region,
      limit,
      offset,
    });
    const totalCount = await getResourceCount({ project, region });

    res.render("resources", {
      title: "Resource Specifications",
      resources: resources,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        hasNext: offset + limit < totalCount,
        hasPrev: page > 1,
      },
      filters: { project, region },
    });
  } catch (error) {
    console.error("Error loading resources:", error);
    res.render("resources", {
      title: "Resource Specifications",
      error: "Unable to load resource specifications",
    });
  }
});

// BoQ calculation page
app.get("/calculate", async (req, res) => {
  try {
    // Get available projects and regions for filters
    const projects = await getAvailableProjects();
    const regions = await getAvailableRegions();

    res.render("calculate", {
      title: "Calculate BoQ",
      projects: projects,
      regions: regions,
    });
  } catch (error) {
    console.error("Error loading calculation page:", error);
    res.render("calculate", {
      title: "Calculate BoQ",
      error: "Unable to load calculation page",
    });
  }
});

// Submit BoQ calculation
app.post("/api/calculate", async (req, res) => {
  try {
    const { projectIds, resourceIds, regions, pricingModels, requestedBy } =
      req.body;

    if (!BOQ_CALCULATOR_URL) {
      return res.status(500).json({
        success: false,
        message: "BoQ Calculator service URL not configured",
      });
    }

    console.log("Submitting BoQ calculation request...");

    // Call the BoQ calculator Cloud Function
    const response = await axios.post(
      BOQ_CALCULATOR_URL,
      {
        projectIds,
        resourceIds,
        regions,
        pricingModels,
        requestedBy: requestedBy || "web-app-user",
      },
      {
        timeout: 300000, // 5 minutes
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Error calling BoQ calculator:", error);
    res.status(500).json({
      success: false,
      message:
        error.response?.data?.message ||
        error.message ||
        "Failed to calculate BoQ",
    });
  }
});

// BoQ results page
app.get("/results", async (req, res) => {
  try {
    const { boqId, project, page = 1 } = req.query;
    const limit = 50;
    const offset = (page - 1) * limit;

    let results, totalCount, summary;

    if (boqId) {
      // Get specific BoQ results
      results = await getBoQResults({ boqId, limit, offset });
      totalCount = await getBoQResultsCount({ boqId });
      summary = await getBoQSummary(boqId);
    } else {
      // Get recent BoQ results
      results = await getRecentBoQResults({ project, limit, offset });
      totalCount = await getRecentBoQResultsCount({ project });
    }

    res.render("results", {
      title: "BoQ Results",
      results: results,
      summary: summary,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        hasNext: offset + limit < totalCount,
        hasPrev: page > 1,
      },
      filters: { boqId, project },
    });
  } catch (error) {
    console.error("Error loading results:", error);
    res.render("results", {
      title: "BoQ Results",
      error: "Unable to load BoQ results",
    });
  }
});

// Pricing catalog page
app.get("/pricing", async (req, res) => {
  try {
    const { service, category, region, page = 1 } = req.query;
    const limit = 100;
    const offset = (page - 1) * limit;

    const pricing = await getPricingCatalog({
      service,
      category,
      region,
      limit,
      offset,
    });
    const totalCount = await getPricingCatalogCount({
      service,
      category,
      region,
    });

    res.render("pricing", {
      title: "Pricing Catalog",
      pricing: pricing,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        hasNext: offset + limit < totalCount,
        hasPrev: page > 1,
      },
      filters: { service, category, region },
    });
  } catch (error) {
    console.error("Error loading pricing:", error);
    res.render("pricing", {
      title: "Pricing Catalog",
      error: "Unable to load pricing catalog",
    });
  }
});

// API endpoint to refresh pricing
app.post("/api/refresh-pricing", async (req, res) => {
  try {
    if (!PRICING_FETCHER_URL) {
      return res.status(500).json({
        success: false,
        message: "Pricing Fetcher service URL not configured",
      });
    }

    console.log("Triggering pricing refresh...");

    const response = await axios.get(`${PRICING_FETCHER_URL}?save=true`, {
      timeout: 60000, // 1 minute
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error refreshing pricing:", error);
    res.status(500).json({
      success: false,
      message:
        error.response?.data?.message ||
        error.message ||
        "Failed to refresh pricing",
    });
  }
});

// API endpoint to get BoQ history
app.get("/api/boq-history", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const history = await getBoQHistory(parseInt(days));
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error getting BoQ history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get BoQ history",
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Helper functions

async function getDashboardStats() {
  try {
    const query = `
      SELECT 
        COUNT(DISTINCT project_id) as total_projects,
        COUNT(*) as total_resources,
        COUNT(DISTINCT region) as total_regions,
        AVG(vcpu_count) as avg_vcpu,
        AVG(memory_gb) as avg_memory,
        COUNT(CASE WHEN pricing_model = 'spot' THEN 1 END) as spot_resources
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_resource_specifications\`
    `;

    const [rows] = await bigquery.query(query);
    const resourceStats = rows[0] || {};

    // Get recent BoQ calculations
    const boqQuery = `
      SELECT 
        COUNT(DISTINCT boq_id) as total_calculations,
        SUM(total_cost_usd) as total_cost,
        AVG(total_cost_usd) as avg_cost,
        COUNT(*) as total_boq_items
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      WHERE DATE(calculation_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    `;

    const [boqRows] = await bigquery.query(boqQuery);
    const boqStats = boqRows[0] || {};

    return { ...resourceStats, ...boqStats };
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    return {};
  }
}

async function getResourceSpecifications({ project, region, limit, offset }) {
  try {
    const conditions = [];
    const params = {};

    if (project) {
      conditions.push("project_id = @project");
      params.project = project;
    }

    if (region) {
      conditions.push("region = @region");
      params.region = region;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_resource_specifications\`
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    params.limit = limit;
    params.offset = offset;

    const [rows] = await bigquery.query({ query, params });
    return rows;
  } catch (error) {
    console.error("Error getting resource specifications:", error);
    return [];
  }
}

async function getResourceCount({ project, region }) {
  try {
    const conditions = [];
    const params = {};

    if (project) {
      conditions.push("project_id = @project");
      params.project = project;
    }

    if (region) {
      conditions.push("region = @region");
      params.region = region;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_resource_specifications\`
      ${whereClause}
    `;

    const [rows] = await bigquery.query({ query, params });
    return rows[0]?.count || 0;
  } catch (error) {
    console.error("Error getting resource count:", error);
    return 0;
  }
}

async function getAvailableProjects() {
  try {
    const query = `
      SELECT DISTINCT project_id
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_resource_specifications\`
      ORDER BY project_id
    `;

    const [rows] = await bigquery.query(query);
    return rows.map((row) => row.project_id);
  } catch (error) {
    console.error("Error getting available projects:", error);
    return [];
  }
}

async function getAvailableRegions() {
  try {
    const query = `
      SELECT DISTINCT region
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_resource_specifications\`
      WHERE region IS NOT NULL
      ORDER BY region
    `;

    const [rows] = await bigquery.query(query);
    return rows.map((row) => row.region);
  } catch (error) {
    console.error("Error getting available regions:", error);
    return [];
  }
}

async function getBoQResults({ boqId, limit, offset }) {
  try {
    const query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      WHERE boq_id = @boqId
      ORDER BY calculation_timestamp DESC
      LIMIT @limit OFFSET @offset
    `;

    const [rows] = await bigquery.query({
      query,
      params: { boqId, limit, offset },
    });
    return rows;
  } catch (error) {
    console.error("Error getting BoQ results:", error);
    return [];
  }
}

async function getBoQResultsCount({ boqId }) {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      WHERE boq_id = @boqId
    `;

    const [rows] = await bigquery.query({
      query,
      params: { boqId },
    });
    return rows[0]?.count || 0;
  } catch (error) {
    console.error("Error getting BoQ results count:", error);
    return 0;
  }
}

async function getBoQSummary(boqId) {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_resources,
        SUM(total_cost_usd) as total_cost,
        SUM(total_discount_usd) as total_discount,
        AVG(total_cost_usd) as avg_cost_per_resource,
        COUNT(DISTINCT project_id) as projects_count,
        COUNT(DISTINCT region) as regions_count
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      WHERE boq_id = @boqId
    `;

    const [rows] = await bigquery.query({
      query,
      params: { boqId },
    });
    return rows[0] || {};
  } catch (error) {
    console.error("Error getting BoQ summary:", error);
    return {};
  }
}

async function getRecentBoQResults({ project, limit, offset }) {
  try {
    const conditions = [];
    const params = { limit, offset };

    if (project) {
      conditions.push("project_id = @project");
      params.project = project;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      ${whereClause}
      ORDER BY calculation_timestamp DESC
      LIMIT @limit OFFSET @offset
    `;

    const [rows] = await bigquery.query({ query, params });
    return rows;
  } catch (error) {
    console.error("Error getting recent BoQ results:", error);
    return [];
  }
}

async function getRecentBoQResultsCount({ project }) {
  try {
    const conditions = [];
    const params = {};

    if (project) {
      conditions.push("project_id = @project");
      params.project = project;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      ${whereClause}
    `;

    const [rows] = await bigquery.query({ query, params });
    return rows[0]?.count || 0;
  } catch (error) {
    console.error("Error getting recent BoQ results count:", error);
    return 0;
  }
}

async function getPricingCatalog({ service, category, region, limit, offset }) {
  try {
    const conditions = ["is_active = true"];
    const params = { limit, offset };

    if (service) {
      conditions.push("service_name = @service");
      params.service = service;
    }

    if (category) {
      conditions.push("category = @category");
      params.category = category;
    }

    if (region) {
      conditions.push("region = @region");
      params.region = region;
    }

    const query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_pricing_catalog\`
      WHERE ${conditions.join(" AND ")}
      ORDER BY service_name, category, sku_name
      LIMIT @limit OFFSET @offset
    `;

    const [rows] = await bigquery.query({ query, params });
    return rows;
  } catch (error) {
    console.error("Error getting pricing catalog:", error);
    return [];
  }
}

async function getPricingCatalogCount({ service, category, region }) {
  try {
    const conditions = ["is_active = true"];
    const params = {};

    if (service) {
      conditions.push("service_name = @service");
      params.service = service;
    }

    if (category) {
      conditions.push("category = @category");
      params.category = category;
    }

    if (region) {
      conditions.push("region = @region");
      params.region = region;
    }

    const query = `
      SELECT COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_pricing_catalog\`
      WHERE ${conditions.join(" AND ")}
    `;

    const [rows] = await bigquery.query({ query, params });
    return rows[0]?.count || 0;
  } catch (error) {
    console.error("Error getting pricing catalog count:", error);
    return 0;
  }
}

async function getBoQHistory(days) {
  try {
    const query = `
      SELECT 
        DATE(calculation_timestamp) as date,
        COUNT(DISTINCT boq_id) as calculations,
        COUNT(*) as total_resources,
        SUM(total_cost_usd) as total_cost
      FROM \`${PROJECT_ID}.${DATASET_ID}.gcp_boq_results\`
      WHERE DATE(calculation_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      GROUP BY DATE(calculation_timestamp)
      ORDER BY date DESC
    `;

    const [rows] = await bigquery.query({
      query,
      params: { days },
    });
    return rows;
  } catch (error) {
    console.error("Error getting BoQ history:", error);
    return [];
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).render("error", {
    title: "Error",
    message: "An unexpected error occurred",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render("error", {
    title: "Page Not Found",
    message: "The requested page could not be found",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`GCP BoQ Web App running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Project ID: ${PROJECT_ID}`);
});
