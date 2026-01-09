const RILLET_API_BASE = process.env.RILLET_API_BASE_URL || 'https://api.rillet.com';
const apiKey = process.env.RILLET_API_KEY;

if (!apiKey) {
  console.log('RILLET_API_KEY not set locally - run on Heroku');
  process.exit(0);
}

async function test() {
  // Test fetching accounts
  console.log('Fetching accounts...');
  const accountsRes = await fetch(RILLET_API_BASE + '/accounts', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  const accountsData = await accountsRes.json();
  const slw = accountsData.accounts?.filter(a => a.code === '24000' || a.code === '24001');
  console.log('SLW accounts found:', JSON.stringify(slw, null, 2));

  // Test fetching first page of journal entries
  console.log('\nFetching journal entries (first page)...');
  const jeRes = await fetch(RILLET_API_BASE + '/journal-entries?limit=10', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  const jeData = await jeRes.json();
  console.log('Journal entries count:', jeData.journal_entries?.length);
  console.log('Has pagination:', !!jeData.pagination?.next_cursor);

  // Check if any JE has 24000 or 24001
  let found = [];
  for (const je of jeData.journal_entries || []) {
    for (const item of je.items || []) {
      if (item.account_code === '24000' || item.account_code === '24001') {
        found.push({ je_name: je.name, account: item.account_code, amount: item.amount, side: item.side });
      }
    }
  }
  console.log('SLW entries in first page:', found.length > 0 ? JSON.stringify(found, null, 2) : 'none');
}

test().catch(console.error);
