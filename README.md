# Wind Speed Microservice

Cloud-hosted microservice for extracting wind speed data from the ASCE Hazard Tool.

## API Endpoint

**POST** `/api/wind-speed`

### Request Body

```json
{
  "address": "411 Crusaders Dr, Sanford, NC"
}
```

### Response

```json
{
  "address": "411 Crusaders Dr, Sanford, NC",
  "windSpeed": 115,
  "vmph": 115,
  "source": "ASCE Hazard Tool",
  "retrievedAt": "2025-12-18T23:00:00.000Z",
  "success": true,
  "rawValue": "Vmph = 115"
}
```

## Local Development

```bash
npm install
npm run dev
```

## Deployment

Deployed to Render.com via GitHub integration.

## Health Check

**GET** `/health`

Returns service status.
