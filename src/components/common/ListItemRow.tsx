import React from "react";

interface ListItemRowProps {
  isLast?: boolean;
  children: React.ReactNode;
}

export const ListItemRow: React.FC<ListItemRowProps> = ({
  isLast,
  children,
}) => {
  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/70 ${
        !isLast ? "border-b border-border-default" : ""
      }`}
    >
      {children}
    </div>
  );
};
