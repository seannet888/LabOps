import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.js";
import { DataTable } from "./DataTable.js";
import { FormField } from "./FormField.js";
import { IconButton } from "./IconButton.js";
import { StatusBadge } from "./StatusBadge.js";

describe("LabOps Compact Console components", () => {
  it("prevents duplicate submits while a button is loading", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button loading onClick={onClick}>保存</Button>);

    const button = screen.getByRole("button", { name: /保存/ });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("requires icon-only buttons to expose an accessible label", () => {
    render(<IconButton ariaLabel="关闭" icon={<span aria-hidden="true">x</span>} />);
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("marks required form labels with a visual asterisk without changing the field name", () => {
    render(
      <FormField label="客户名称" htmlFor="customerName" required>
        <input id="customerName" />
      </FormField>
    );

    expect(screen.getByLabelText("客户名称")).toBeInTheDocument();
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders data table loading, empty, data, and pagination states", () => {
    const { rerender } = render(
      <DataTable columns={[{ key: "name", header: "名称" }]} rows={[]} loading />
    );
    expect(screen.getByText("正在加载数据")).toBeInTheDocument();

    rerender(<DataTable columns={[{ key: "name", header: "名称" }]} rows={[]} />);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();

    rerender(
      <DataTable
        columns={[{ key: "name", header: "名称" }]}
        rows={[{ id: "1", name: "C57BL/6" }]}
        pagination={{ page: 1, totalPages: 2, onPageChange: vi.fn() }}
      />
    );
    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "C57BL/6" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
  });

  it("status badges include text and do not rely on color alone", () => {
    render(<StatusBadge tone="success">已确认</StatusBadge>);
    expect(screen.getByText("已确认")).toBeInTheDocument();
    expect(screen.getByText("已确认").querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });
});
