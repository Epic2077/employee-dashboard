"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth/actions";
import { ROLE_LABELS, toAppRole } from "@/lib/auth/roles";
import { getInitials } from "@/lib/utils";
import {
  ChevronsUpDownIcon,
  KeyRoundIcon,
  LogOutIcon,
  UserIcon,
} from "lucide-react";

export function NavUser({
  user,
  role,
  teamManager,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
  role?: string;
  teamManager?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initials = getInitials(user.name);
  const roleLabel = teamManager ? "مدیر تیم" : ROLE_LABELS[toAppRole(role)];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar>
              {user.avatar ? (
                <AvatarImage src={user.avatar} alt={user.name} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    {user.avatar ? (
                      <AvatarImage src={user.avatar} alt={user.name} />
                    ) : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        {roleLabel}
                      </span>
                    </div>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  router.push("/change-password");
                }}
              >
                <KeyRoundIcon />
                تغییر رمز عبور
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  router.push("/");
                }}
              >
                <UserIcon />
                داشبورد
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await signOut();
                });
              }}
            >
              <LogOutIcon />
              {isPending ? "در حال خروج…" : "خروج از حساب"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
