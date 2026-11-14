import Link from "next/link";
import { Table, Th, Td, TwoLine } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { shortDate } from "@/lib/dates";
import { plural } from "@/lib/utils";
import type { ExpenseDTO } from "@/lib/types";

/** Every expense across visible accounts, newest first, with a total footer. */
export function ExpenseTable({ expenses }: { expenses: ExpenseDTO[] }) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return (
    <Table>
      <thead>
        <tr>
          <Th hideOnPhone>Date</Th>
          <Th hideOnPhone>Account</Th>
          <Th>Vendor / note</Th>
          <Th hideOnPhone>Category</Th>
          <Th hideOnPhone>Billable</Th>
          <Th numeric>Amount</Th>
        </tr>
      </thead>
      <tbody>
        {expenses.map((e) => {
          const date = shortDate(e.date);
          const account = (
            <Link href={`/accounts/${e.accountId}`} className="link">
              {e.accountName ?? "Account"}
            </Link>
          );
          return (
            <tr key={e.id}>
              <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                {date}
              </Td>
              <Td hideOnPhone>{account}</Td>
              <Td>
                <TwoLine
                  className="py-0 max-md:py-2"
                  primary={e.vendor || <span className="text-ink-3">–</span>}
                  secondary={
                    <>
                      {account} · {e.category} · {date}
                    </>
                  }
                  phoneOnly
                />
              </Td>
              <Td hideOnPhone>
                <Tag>{e.category}</Tag>
              </Td>
              <Td hideOnPhone className="text-ink-2">
                {e.billable ? "Yes" : "No"}
              </Td>
              <Td numeric>
                <Money value={e.amount} />
              </Td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="total">
          <td colSpan={5} className="max-md:hidden">
            Total · {plural(expenses.length, "expense")}
          </td>
          <td className="pl-0 md:hidden">Total</td>
          <Td numeric>
            <Money value={total} />
          </Td>
        </tr>
      </tfoot>
    </Table>
  );
}
