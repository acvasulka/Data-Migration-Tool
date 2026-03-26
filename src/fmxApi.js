const FIELD_TYPE_MAP = {
  Text: 'string',
  Number: 'number',
  Date: 'date',
};

const SCHEMA_ENDPOINTS = {
  Building: 'buildings',
  Resource: 'resources',
};

export async function fetchPostOptions(fmxSiteUrl, email, password, schemaType) {
  const endpoint = SCHEMA_ENDPOINTS[schemaType];
  if (!endpoint || !fmxSiteUrl) return null;
  const base = fmxSiteUrl.startsWith('http') ? fmxSiteUrl : `https://${fmxSiteUrl}`;
  const headers = email && password
    ? { Authorization: `Basic ${btoa(`${email}:${password}`)}` }
    : {};
  try {
    const res = await fetch(`${base}/api/v1/${endpoint}/post-options`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.customFields ?? []).map(cf => ({
      name: cf.label,
      required: cf.isRequired || false,
      type: FIELD_TYPE_MAP[cf.fieldTypeName] || 'string',
    }));
  } catch {
    return null;
  }
}
