const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();
const app = express();

app.use(express.json());

// Environment Variables (Update with your actual credentials)
const USERNAME = "admin";
const PASSWORD = "admin";
const CLIENT_REGISTRATION_URL = "https://wso2apim4.evantagesoft.com/client-registration/v0.17/register";
const TOKEN_URL = "https://wso2apim4.evantagesoft.com/oauth2/token";

// Temporary in-memory storage for the access token
let accessTokenStorage = null;

// Automate Authorization Flow
app.post("/automate", async (req, res) => {
  try {
    // Step 1: Register Client
    const clientResponse = await axios.post(
      CLIENT_REGISTRATION_URL,
      {
        callbackUrl: "www.google.lk",
        clientName: "rest_api_publisher",
        owner: USERNAME,
        grantType: "client_credentials password refresh_token",
        saasApp: true,
      },
      {
        auth: {
          username: USERNAME,
          password: PASSWORD,
        },
      }
    );

    const { clientId, clientSecret } = clientResponse.data;

    // Encode clientId and clientSecret in Base64
    const base64EncodedCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    // Step 2: Get Access Token
    const tokenResponse = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: "password",
        username: USERNAME,
        password: PASSWORD,
        scope: "apim:api_view apim:api_create apim:api_manage apim:api_delete apim:api_publish apim:subscription_view apim:subscription_block apim:subscription_manage apim:external_services_discover apim:threat_protection_policy_create apim:threat_protection_policy_manage apim:document_create apim:document_manage apim:mediation_policy_view apim:mediation_policy_create apim:mediation_policy_manage apim:client_certificates_view apim:client_certificates_add apim:client_certificates_update apim:ep_certificates_view apim:ep_certificates_add apim:ep_certificates_update apim:publisher_settings apim:pub_alert_manage apim:shared_scope_manage apim:app_import_export apim:api_import_export apim:api_product_import_export apim:api_generate_key apim:common_operation_policy_view apim:common_operation_policy_manage apim:comment_write apim:comment_view apim:admin apim:subscription_approval_view apim:subscription_approval_manage apim:llm_provider_read",
      }),
      {
        headers: {
          Authorization: `Basic ${base64EncodedCredentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    // Store the access token temporarily
    accessTokenStorage = access_token;

    // Return all required information
    res.status(200).json({
      message: "Authorization successful",
      clientId,
      clientSecret,
      base64EncodedCredentials,
      accessToken: access_token,
    });
  } catch (error) {
    console.error("Error in authorization process:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || "Internal Server Error" });
  }
});

const GET_APIS_URL = "https://wso2apim4.evantagesoft.com/api/am/publisher/v4/apis";
const GET_SUBSCRIPTIONS_URL = "https://wso2apim4.evantagesoft.com/api/am/publisher/v4/subscriptions";
const GET_THROTTLING_POLICIES_URL = "https://wso2apim4.evantagesoft.com/api/am/devportal/v3/throttling-policies/subscription";

// Automate GET API Workflow
app.get("/fetch-data", async (req, res) => {
  try {
    // Step 1: Use the stored access token
    if (!accessTokenStorage) {
      return res.status(400).json({ error: "Access token is required. Please run /automate first." });
    }

    // Step 2: Call the first GET API to retrieve all APIs
    const apisResponse = await axios.get(GET_APIS_URL, {
      headers: { Authorization: `Bearer ${accessTokenStorage}` },
    });

    const apis = apisResponse.data.list;
    if (!apis || apis.length === 0) {
      return res.status(404).json({ error: "No APIs found" });
    }

    // Step 3: Iterate through all APIs and fetch subscriptions for each
    const subscriptionsData = await Promise.all(
      apis.map(async (api) => {
        const apiId = api.id;
        try {
          const subscriptionsResponse = await axios.get(
            `${GET_SUBSCRIPTIONS_URL}?apiId=${apiId}`,
            {
              headers: { Authorization: `Bearer ${accessTokenStorage}` },
            }
          );
          return {
            apiId,
            apiName: api.name,
            subscriptions: subscriptionsResponse.data.list,
          };
        } catch (error) {
          console.error(`Error fetching subscriptions for API ID ${apiId}:`, error.response?.data || error.message);
          return {
            apiId,
            apiName: api.name,
            subscriptions: [],
            error: error.response?.data || "Error fetching subscriptions",
          };
        }
      })
    );

    // Step 4: Call the third GET API to retrieve throttling policies
    const throttlingPoliciesResponse = await axios.get(
      GET_THROTTLING_POLICIES_URL,
      {
        headers: { Authorization: `Bearer ${accessTokenStorage}` },
      }
    );

    const throttlingPolicies = throttlingPoliciesResponse.data.list;

    // Combine all responses and send back to the client
    res.status(200).json({
      message: "Data fetched successfully",
      apis,
      subscriptionsData,
      throttlingPolicies,
    });
  } catch (error) {
    console.error("Error in fetching data:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || "Internal Server Error" });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
