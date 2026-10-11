// A business can be a registered business name owned by a company or person, for example
// "SLEDIEN Pte Ltd trading as Vibrant". Documents then show the trading name as the brand and
// this line underneath, with the owner's TIN.

export function tradingAsLine(b?: { name?: string; legalName?: string } | null) {
  const legal = (b?.legalName || '').trim();
  const name = (b?.name || '').trim();
  return legal && legal.toLowerCase() !== name.toLowerCase() ? `${legal} trading as ${name}` : '';
}
