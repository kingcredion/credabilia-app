import React, { createContext, useContext, useState } from "react";

const ActiveRoleContext = createContext({ activeRole: "collector", setActiveRole: () => {} });

export function ActiveRoleProvider({ children }) {
  const [activeRole, setActiveRole] = useState("collector");
  return (
    <ActiveRoleContext.Provider value={{ activeRole, setActiveRole }}>
      {children}
    </ActiveRoleContext.Provider>
  );
}

export function useActiveRole() {
  return useContext(ActiveRoleContext);
}