type QuantityTextProps = {
  value: number;
  unit?: string;
};

export function QuantityText({ value, unit = "只" }: QuantityTextProps) {
  return <span className="numeric-text">{value}{unit}</span>;
}
