import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { campaigns } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export default function MarketingPage() {
  return (
    <div className="pb-8">
      <PageHeader
        title="Marketing"
        description="Pitching, campaign control, smart links and pre-save analytics."
        actions={<Button>Create Campaign</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Active Campaigns" value="2" />
        <MetricCard label="Smart Links" value="14" />
        <MetricCard label="Pre-save CVR" value="17.6%" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Campaign Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Spent</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Conversions</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium text-white">{campaign.name}</TableCell>
                    <TableCell>{campaign.channel}</TableCell>
                    <TableCell>{formatCurrency(campaign.budget)}</TableCell>
                    <TableCell>{formatCurrency(campaign.spent)}</TableCell>
                    <TableCell>{campaign.clicks.toLocaleString()}</TableCell>
                    <TableCell>{campaign.conversions.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={campaign.status === "Active" ? "success" : "muted"}>{campaign.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
