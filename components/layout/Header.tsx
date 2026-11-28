import { Bell } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getInitials } from "@/lib/utils";

export default function Header({
  user,
}: {
  user: {
    name: string;
    avatar?: string;
  };
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b-2 border-border pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="size-9 shrink-0 rounded-xl border border-border bg-card shadow-xs rtl:-scale-x-100 md:size-7 md:rounded-[min(var(--radius-md),12px)] md:border-transparent md:bg-transparent md:shadow-none" />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-bold text-xl">کوروش پارس</p>
          <p className="text-sm text-muted-foreground">پورتال خدمات کارمندان</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-6">
        <Bell className="size-5" />
        <Avatar>
          {user.avatar ? (
            <AvatarImage src={user.avatar} alt={user.name} />
          ) : null}
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
