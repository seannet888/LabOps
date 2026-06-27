type MoneyTextProps = {
  value: string;
  currency?: string;
};

export function MoneyText({ value, currency = "CNY" }: MoneyTextProps) {
  return <span className="numeric-text">{value} {currency}</span>;
}
