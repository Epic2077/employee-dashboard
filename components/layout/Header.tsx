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
    <header className="flex items-center justify-between border-b-2 border-border pb-5">
      <div className="flex flex-col gap-2">
        <p className="font-bold text-xl">کوروش پارس</p>
        <p className="text-sm text-muted-foreground">پورتال خدمات کارمندان</p>
      </div>
      <div className="flex items-center gap-3 sm:gap-6">
        <SidebarTrigger className="-ms-1 rtl:-scale-x-100" />
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
