#!/usr/bin/env node
// Refreshes ../prices.json with current object-storage list prices.
// Dynamic (keyless public APIs): AWS S3 bulk price list, Azure Retail Prices API.
// Dynamic (optional key):        GCS via Cloud Billing Catalog API — set GCP_API_KEY.
// Pinned in STATIC below:        retrieval/egress rates, min durations, Gcore / R2
//                                (no public pricing APIs; verified manually 2026-07-10).
// Storage prices in STATIC are last-known fallbacks — kept when an API call fails.

import { writeFileSync } from 'node:fs';

const OUT = new URL('../prices.json', import.meta.url);
const sane = (n) => Number.isFinite(n) && n > 0 && n < 0.1;

const awsTiers = () => ({
  standard: { label: 'Standard', storage_gb_mo: 0.023, retrieval_gb: 0, min_days: 0, object_lock: true },
  standard_ia: { label: 'Standard-IA', storage_gb_mo: 0.0125, retrieval_gb: 0.01, min_days: 30, object_lock: true },
  glacier_ir: { label: 'Glacier Instant Retrieval', storage_gb_mo: 0.004, retrieval_gb: 0.03, min_days: 90, object_lock: true },
  glacier_flexible: { label: 'Glacier Flexible Retrieval', storage_gb_mo: 0.0036, retrieval_gb: 0.01, min_days: 90, object_lock: true },
  deep_archive: { label: 'Glacier Deep Archive', storage_gb_mo: 0.00099, retrieval_gb: 0.02, min_days: 180, object_lock: true },
});
const gcsTiers = () => ({
  standard: { label: 'Standard', storage_gb_mo: 0.02, retrieval_gb: 0, min_days: 0, object_lock: true },
  nearline: { label: 'Nearline', storage_gb_mo: 0.01, retrieval_gb: 0.01, min_days: 30, object_lock: true },
  coldline: { label: 'Coldline', storage_gb_mo: 0.004, retrieval_gb: 0.02, min_days: 90, object_lock: true },
  archive: { label: 'Archive', storage_gb_mo: 0.0012, retrieval_gb: 0.05, min_days: 365, object_lock: true },
});
const azureTiers = () => ({
  hot: { label: 'Hot', storage_gb_mo: 0.0208, retrieval_gb: 0, min_days: 0, object_lock: true },
  cool: { label: 'Cool', storage_gb_mo: 0.0152, retrieval_gb: 0.01, min_days: 30, object_lock: true },
  cold: { label: 'Cold', storage_gb_mo: 0.0036, retrieval_gb: 0.03, min_days: 90, object_lock: true },
  archive: { label: 'Archive', storage_gb_mo: 0.00099, retrieval_gb: 0.02, min_days: 180, object_lock: true },
});

const prices = {
  updated: new Date().toISOString().slice(0, 10),
  providers: {
    aws: {
      label: 'AWS S3',
      note: 'First 100 GB/mo egress to internet free (account-wide). Glacier tiers: retrieval latency minutes–48 h by class.',
      regions: {
        'us-east-1': { label: 'US East (N. Virginia)', group: 'US', egress_gb: 0.09, tiers: awsTiers() },
        'us-west-2': { label: 'US West (Oregon)', group: 'US', egress_gb: 0.09, tiers: awsTiers() },
        'eu-west-1': { label: 'Europe (Ireland)', group: 'EU', egress_gb: 0.09, tiers: awsTiers() },
        'eu-central-1': { label: 'Europe (Frankfurt)', group: 'EU', egress_gb: 0.09, tiers: awsTiers() },
        'ap-southeast-1': { label: 'Asia Pacific (Singapore)', group: 'AP', egress_gb: 0.12, tiers: awsTiers() },
        'ap-northeast-1': { label: 'Asia Pacific (Tokyo)', group: 'AP', egress_gb: 0.114, tiers: awsTiers() },
      },
    },
    gcs: {
      label: 'Google Cloud Storage',
      note: 'Egress tiered: 0.12 (0–10 TB/mo) / 0.11 (10–150 TB) / 0.08 (150 TB+); first-tier rate used. More regions: set GCP_API_KEY and add region keys.',
      regions: {
        'us-east1': { label: 'US East (South Carolina)', group: 'US', egress_gb: 0.12, tiers: gcsTiers() },
        'europe-west1': { label: 'Europe (Belgium)', group: 'EU', egress_gb: 0.12, tiers: gcsTiers() },
      },
    },
    azure: {
      label: 'Azure Blob (LRS)',
      note: 'General Purpose v2, LRS. First 100 GB/mo egress free. Archive reads need rehydration (hours; priority 0.10/GB).',
      regions: {
        eastus: { label: 'East US', group: 'US', egress_gb: 0.087, tiers: azureTiers() },
        westus2: { label: 'West US 2', group: 'US', egress_gb: 0.087, tiers: azureTiers() },
        westeurope: { label: 'West Europe', group: 'EU', egress_gb: 0.087, tiers: azureTiers() },
        northeurope: { label: 'North Europe', group: 'EU', egress_gb: 0.087, tiers: azureTiers() },
        southeastasia: { label: 'Southeast Asia', group: 'AP', egress_gb: 0.12, tiers: azureTiers() },
        japaneast: { label: 'Japan East', group: 'AP', egress_gb: 0.12, tiers: azureTiers() },
      },
    },
    gcore: {
      label: 'Gcore S3',
      note: 'Billed in € (Standard: €0.04/GB stored + €0.02/GB egress) — USD approximations shown. S3 Object Lock not documented — verify before trusting it with the immutable copy.',
      regions: {
        global: { label: 'All locations', group: 'GLOBAL', egress_gb: 0.022, tiers: {
          standard: { label: 'Standard', storage_gb_mo: 0.044, retrieval_gb: 0, min_days: 0, object_lock: 'not documented' },
        } },
      },
    },
    r2: {
      label: 'Cloudflare R2',
      note: 'Zero egress. Immutability is bucket-level lock only — no per-object S3 Object Lock.',
      regions: {
        global: { label: 'All regions', group: 'GLOBAL', egress_gb: 0, tiers: {
          standard: { label: 'Standard', storage_gb_mo: 0.015, retrieval_gb: 0, min_days: 0, object_lock: 'bucket-level' },
          ia: { label: 'Infrequent Access', storage_gb_mo: 0.01, retrieval_gb: 0.01, min_days: 30, object_lock: 'bucket-level' },
        } },
      },
    },
  },
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

let updatedCount = 0;
const set = (tier, usd, src) => {
  if (!sane(usd)) return;
  tier.storage_gb_mo = usd;
  updatedCount++;
};

async function fetchAws(p) {
  // Match the exact storage usage types — volumeType alone also catches staging/overhead SKUs.
  const USAGE = {
    'TimedStorage-ByteHrs': 'standard',
    'TimedStorage-SIA-ByteHrs': 'standard_ia',
    'TimedStorage-GIR-ByteHrs': 'glacier_ir',
    'TimedStorage-GlacierByteHrs': 'glacier_flexible',
    'TimedStorage-GDA-ByteHrs': 'deep_archive',
  };
  for (const [region, r] of Object.entries(p.regions)) {
    const offer = await getJson(`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/${region}/index.json`);
    for (const [sku, prod] of Object.entries(offer.products)) {
      const usage = prod.attributes?.usagetype ?? '';
      const tierKey = prod.productFamily === 'Storage' &&
        Object.entries(USAGE).find(([suffix]) => usage.endsWith(suffix))?.[1];
      if (!tierKey) continue;
      const term = Object.values(offer.terms?.OnDemand?.[sku] ?? {})[0];
      const dim = term && Object.values(term.priceDimensions).find((d) => d.beginRange === '0' && d.unit === 'GB-Mo');
      if (dim) set(r.tiers[tierKey], parseFloat(dim.pricePerUnit?.USD));
    }
    console.log(`aws/${region} ok`);
  }
}

async function fetchAzure(p) {
  const METERS = {
    'Hot LRS Data Stored': 'hot',
    'Cool LRS Data Stored': 'cool',
    'Cold LRS Data Stored': 'cold',
    'Archive LRS Data Stored': 'archive',
  };
  for (const [region, r] of Object.entries(p.regions)) {
    let url = `https://prices.azure.com/api/retail/prices?currencyCode='USD'&$filter=` +
      encodeURIComponent(`serviceName eq 'Storage' and productName eq 'General Block Blob v2' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
    while (url) {
      const page = await getJson(url);
      for (const it of page.Items ?? []) {
        const tierKey = METERS[it.meterName];
        if (tierKey && it.tierMinimumUnits === 0 && /GB\/Month/i.test(it.unitOfMeasure)) set(r.tiers[tierKey], it.retailPrice);
      }
      url = page.NextPageLink;
    }
    console.log(`azure/${region} ok`);
  }
}

async function fetchGcs(p) {
  const key = process.env.GCP_API_KEY;
  if (!key) { console.warn('gcs: GCP_API_KEY not set - keeping pinned prices'); return; }
  const GROUPS = { RegionalStorage: 'standard', NearlineStorage: 'nearline', ColdlineStorage: 'coldline', ArchiveStorage: 'archive' };
  const skus = [];
  let pageToken = '';
  do { // Cloud Storage service id
    const j = await getJson(`https://cloudbilling.googleapis.com/v1/services/95FF-2EF5-5EA1/skus?pageSize=5000&key=${key}&pageToken=${pageToken}`);
    skus.push(...(j.skus ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  for (const [region, r] of Object.entries(p.regions)) {
    for (const sku of skus) {
      const tierKey = sku.category?.resourceFamily === 'Storage' && GROUPS[sku.category?.resourceGroup];
      if (!tierKey || /early delete/i.test(sku.description) || !(sku.serviceRegions ?? []).includes(region)) continue;
      const expr = sku.pricingInfo?.[0]?.pricingExpression;
      const rate = expr?.tieredRates?.at(-1)?.unitPrice;
      if (expr?.usageUnit === 'GiBy.mo' && rate) set(r.tiers[tierKey], Number(rate.units ?? 0) + (rate.nanos ?? 0) / 1e9);
    }
    console.log(`gcs/${region} ok`);
  }
}

const results = await Promise.allSettled([
  fetchAws(prices.providers.aws),
  fetchAzure(prices.providers.azure),
  fetchGcs(prices.providers.gcs),
]);
for (const r of results) if (r.status === 'rejected') console.warn(`fetch failed (pinned prices kept): ${r.reason}`);

// Self-check: every tier must carry a sane price before we overwrite prices.json.
for (const [pk, p] of Object.entries(prices.providers))
  for (const [rk, r] of Object.entries(p.regions))
    for (const [tk, t] of Object.entries(r.tiers))
      if (!sane(t.storage_gb_mo)) throw new Error(`insane price ${pk}/${rk}/${tk}: ${t.storage_gb_mo}`);

writeFileSync(OUT, JSON.stringify(prices, null, 2) + '\n');
console.log(`prices.json written; ${updatedCount} prices refreshed from APIs`);
