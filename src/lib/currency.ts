const tengeFormatter = new Intl.NumberFormat('ru-KZ', {
  maximumFractionDigits: 0,
});

export function formatTenge(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${tengeFormatter.format(Math.round(value))} ₸`;
}

export function replaceDollarAmounts(text: string): string {
  return text.replace(/\$(\d+(?:\.\d+)?)/g, (_, amount: string) =>
    formatTenge(Number(amount))
  );
}
