import type { ReactNode } from "react";
import { Button } from "./Button.js";

type Row = { id: string } & Record<string, unknown>;

type Column<T extends Row> = {
  key: keyof T & string;
  header: string;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T extends Row> = {
  columns: Array<Column<T>>;
  rows: T[];
  loading?: boolean;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
};

export function DataTable<T extends Row>({ columns, rows, loading = false, pagination }: DataTableProps<T>) {
  if (loading) {
    return <div className="table-state">正在加载数据</div>;
  }

  if (rows.length === 0) {
    return <div className="table-state">暂无数据</div>;
  }

  return (
    <div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <div className="pagination" aria-label="分页">
          <Button
            variant="secondary"
            disabled={pagination.page <= 1}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            上一页
          </Button>
          <Button
            variant="secondary"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </div>
  );
}
