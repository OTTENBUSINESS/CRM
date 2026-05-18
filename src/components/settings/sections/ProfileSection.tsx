import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

export function ProfileSection() {
  const { user, teamMember } = useAuth();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
              {(teamMember?.name || user?.email || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold">{teamMember?.name || user?.email?.split("@")[0] || "Usuário"}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {teamMember?.role || "user"}
                </Badge>
                {teamMember?.team && (
                  <Badge variant="secondary" className="text-xs">
                    {teamMember.team}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                defaultValue={teamMember?.name || user?.email?.split("@")[0] || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Cargo/Função</Label>
              <Input id="role" defaultValue={teamMember?.role || "user"} disabled />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                defaultValue={user?.email || teamMember?.email || ""}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team">Time</Label>
              <Input id="team" defaultValue={teamMember?.team || "Não definido"} disabled />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
