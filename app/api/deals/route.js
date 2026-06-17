export async function GET() {
  const token = process.env.HUBSPOT_API_KEY;
  if (!token) return Response.json({ error: 'Missing HUBSPOT_API_KEY' }, { status: 500 });

  const clean = (str) => (str || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[^\x00-\x7F]/g, '');

  const extractBrandFromName = (dealName) => {
    const name = clean(dealName || '');
    // Try common separators: ' - ', ' – ', ' | ', ': '
    const separators = [' - ', ' \u2013 ', ' | ', ': '];
    for (const sep of separators) {
      if (name.includes(sep)) return name.split(sep)[0].trim();
    }
    return name; // return full name if no separator found
  };

  try {
    let allDeals = [];
    let after = undefined;

    while (true) {
      const body = {
        filterGroups: [{
          filters: [
            { propertyName: 'dealtype', operator: 'EQ', value: 'existingbusiness' },
            { propertyName: 'closedate', operator: 'GTE', value: new Date('2026-06-01').getTime().toString() },
            { propertyName: 'closedate', operator: 'LTE', value: new Date('2027-05-31').getTime().toString() },
          ],
        }],
        properties: ['dealname', 'amount', 'dealstage', 'dealtype', 'closedate', 'pipeline'],
        limit: 100,
        ...(after ? { after } : {}),
      };

      const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
      const data = await res.json();
      allDeals = allDeals.concat(data.results || []);
      if (data.paging?.next?.after) { after = data.paging.next.after; } else { break; }
    }

    // For each deal fetch company association, fall back to deal name parsing
    const dealsWithCompany = await Promise.all(allDeals.map(async (deal) => {
      const cleanDealName = clean(deal.properties.dealname);
      let companyName = extractBrandFromName(deal.properties.dealname);

      try {
        const assocRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${deal.id}/associations/companies`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (assocRes.ok) {
          const assocData = await assocRes.json();
          const companyIds = (assocData.results || []).map(r => r.id);
          if (companyIds.length > 0) {
            const compRes = await fetch(
              `https://api.hubapi.com/crm/v3/objects/companies/${companyIds[0]}?properties=name`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (compRes.ok) {
              const compData = await compRes.json();
              const name = clean(compData.properties?.name || '');
              if (name) companyName = name;
            }
          }
        }
      } catch {}

      return {
        ...deal,
        companyName,
        properties: { ...deal.properties, dealname: cleanDealName },
      };
    }));

    return Response.json({ deals: dealsWithCompany });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
