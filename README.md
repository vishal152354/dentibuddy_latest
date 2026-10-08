# DentiBuddy

Pediatric dental care app: find dentists, book visits, manage children, AI chat, a photo-based Teeth Check, and an admin portal with live latency metrics.

## Run locally

Requirements: Node.js 20+ and MongoDB (Docker is the easiest way to get it).

```bash
# 1. MongoDB
docker run -d --name dentibuddy-mongo -p 27017:27017 mongo:7

# 2. Config
cp .env.example .env        # then set JWT_SECRET to a random string

# 3. Install and start (API on :3001, web app on :8080)
npm install
npm run dev
```

Open http://localhost:8080 and click **Load Demo Data** on the landing page to create demo accounts:

| Role | Email | Password |
|---|---|---|
| Admin | admin@dentibuddy.com | admin123 |
| Doctor | doctor@dentibuddy.com | doctor123 |
| Patient | patient@dentibuddy.com | patient123 |

## Teeth Check

Parents upload or take a photo of their child's teeth and tick any symptoms. The result is **normal**, **abnormal** (consultation recommended) or **emergency**.

- The photo is scored by the open-source [steven123/Check_GoodBad_Teeth](https://huggingface.co/steven123/Check_GoodBad_Teeth) classifier, converted to 8-bit ONNX and committed at `server/models/teeth-goodbad/` (~87 MB). It runs inside the Node API; no Python is needed at runtime.
- Emergency is decided by symptom rules (swelling, injury, uncontrolled bleeding, fever with pain), never by the photo.
- Photos are analysed in memory and not stored.

**Known limitation:** in local testing the model reacted more to camera angle than to dental health (front-on smiles tend to score "good", open-mouth photos "bad"). Treat it as a placeholder to be replaced with a better model.

To regenerate the model file: `python3 scripts/convert_teeth_model.py` (see the script header for its Python dependencies).

## Admin portal

Log in as the admin to see all bookings and children, and the **Performance** tab with live API, database and webpage latency. Metrics are stored in MongoDB (`api_metrics`, `web_metrics`) and expire after `METRICS_RETENTION_DAYS` (default 30).
