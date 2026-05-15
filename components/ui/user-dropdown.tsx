import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "../../app/components/ui/utils";
import { Icon } from "@iconify/react";

const MENU_ITEMS = {
  status: [
    { value: "focus", icon: "solar:emoji-funny-circle-line-duotone", label: "Focus" },
    { value: "offline", icon: "solar:moon-sleep-line-duotone", label: "Appear Offline" },
  ],
  profile: [
    { icon: "solar:user-circle-line-duotone", label: "Your profile", action: "profile" },
    { icon: "solar:settings-line-duotone", label: "Settings", action: "settings" },
    { icon: "solar:bell-line-duotone", label: "Notifications", action: "notifications" },
  ],
  premium: [
    {
      icon: "solar:star-bold",
      label: "Upgrade to Pro",
      action: "upgrade",
      iconClass: "text-[#A78BFA]",
      badge: { text: "20% off", className: "" },
    },
  ],
  account: [
    {
      icon: "solar:users-group-rounded-bold-duotone",
      label: "Switch account",
      action: "switch",
      showAvatar: false,
    },
    { icon: "solar:logout-2-bold-duotone", label: "Log out", action: "logout" },
  ],
};

interface UserDropdownUser {
  name: string;
  username: string;
  avatar?: string;
  initials: string;
  status: "online" | "offline" | "busy";
}

interface UserDropdownProps {
  user?: UserDropdownUser;
  onAction?: (action: string) => void;
  onStatusChange?: (status: string) => void;
  selectedStatus?: string;
  promoDiscount?: string;
}

export const UserDropdown = ({
  user = {
    name: "User",
    username: "@user",
    avatar: undefined,
    initials: "U",
    status: "online",
  },
  onAction = () => {},
  onStatusChange = () => {},
  selectedStatus = "online",
  promoDiscount = "20% off",
}: UserDropdownProps) => {
  const renderMenuItem = (item: typeof MENU_ITEMS.profile[0] & {
    iconClass?: string;
    badge?: { text: string; className: string };
    rightIcon?: string;
    showAvatar?: boolean;
  }, index: number) => (
    <DropdownMenuItem
      key={index}
      className={cn(
        item.badge || item.showAvatar || item.rightIcon ? "justify-between" : "",
        "p-2 rounded-lg cursor-pointer"
      )}
      onClick={() => onAction(item.action)}
    >
      <span className="flex items-center gap-1.5 font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
        <Icon
          icon={item.icon}
          className={`size-5 ${item.iconClass || ""}`}
          style={!item.iconClass ? { color: "#666" } : undefined}
        />
        {item.label}
      </span>
      {item.badge && (
        <Badge
          className="text-white text-[11px] border-0"
          style={{ background: "#7C3AED" }}
        >
          {promoDiscount || item.badge.text}
        </Badge>
      )}
      {item.rightIcon && (
        <Icon
          icon={item.rightIcon}
          className="size-4"
          style={{ color: "#666" }}
        />
      )}
      {item.showAvatar && (
        <Avatar className="cursor-pointer size-6">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
      )}
    </DropdownMenuItem>
  );

  const getStatusStyle = (status: string) => {
    const styles: Record<string, React.CSSProperties> = {
      online: {
        background: "rgba(13,148,136,0.15)",
        border: "1px solid rgba(13,148,136,0.3)",
        color: "#0D9488",
      },
      offline: {
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#888",
      },
      busy: {
        background: "rgba(236,72,153,0.15)",
        border: "1px solid rgba(236,72,153,0.3)",
        color: "#EC4899",
      },
    };
    return styles[status.toLowerCase()] || styles.online;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ease"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.10)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)";
          }}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-white text-sm font-medium opacity-85">{user.initials}</span>
          )}
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="no-scrollbar w-[310px] rounded-2xl p-0" align="end">
        {/* Profile header section */}
        <section
          className="backdrop-blur-lg rounded-2xl p-1 shadow"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center p-2">
            <div className="flex-1 flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-white text-sm font-medium">{user.initials}</span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-sm text-white">{user.name}</h3>
                <p className="text-xs" style={{ color: "#888" }}>{user.username}</p>
              </div>
            </div>
            <Badge
              className="border-[0.5px] text-[11px] rounded-sm capitalize font-medium"
              style={getStatusStyle(user.status)}
            >
              {user.status}
            </Badge>
          </div>

          <DropdownMenuGroup>
            {MENU_ITEMS.profile.map(renderMenuItem)}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {MENU_ITEMS.premium.map(renderMenuItem)}
          </DropdownMenuGroup>
        </section>

        <section className="mt-1 p-1 rounded-2xl">
          <DropdownMenuGroup>
            {MENU_ITEMS.account.map(renderMenuItem)}
          </DropdownMenuGroup>
        </section>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;
