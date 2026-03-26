import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Tab root paths — navigating to these clears the stack
const TAB_ROOTS = ["/Marketplace", "/Messages", "/Profile", "/MyCollection", "/MyListings",
  "/MyAudits", "/FrameShopDashboard", "/ArtistDashboard", "/InfluencerDashboard", "/Feed", "/RewardCenter", "/ExploreFrameShops"];

function isTabRoot(pathname) {
  return TAB_ROOTS.some(root => pathname.toLowerCase() === root.toLowerCase() || pathname === "/");
}

const NavigationContext = createContext(null);

export function NavigationProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const stackRef = useRef([]);
  const [canGoBack, setCanGoBack] = useState(false);
  // "push" = slide in from right, "pop" = slide in from left, "tab" = tab switch, "replace" = no animation
  const [direction, setDirection] = useState("push");
  const isNavigatingRef = useRef(false);

  // Unified back button handler — triggered by browser back or in-app back button
  const handleBackButton = (event) => {
    const stack = stackRef.current;
    if (stack.length > 1) {
      // Only prevent default if we can go back in our stack
      event.preventDefault();
      goBack();
    }
  };

  useEffect(() => {
    // Sync browser history with our navigation stack
    window.addEventListener("popstate", handleBackButton);
    return () => window.removeEventListener("popstate", handleBackButton);
  }, []);

  useEffect(() => {
    const current = { pathname: location.pathname, search: location.search };
    const stack = stackRef.current;
    const top = stack[stack.length - 1];

    if (isTabRoot(location.pathname)) {
      // Tab root navigation: reset stack and mark as tab change
      stackRef.current = [current];
      setCanGoBack(false);
      setDirection("tab");
    } else {
      const secondToTop = stack[stack.length - 2];

      // Detect if we're going back
      const isGoingBack =
        stack.length >= 2 &&
        secondToTop &&
        secondToTop.pathname === current.pathname &&
        secondToTop.search === current.search;

      if (isGoingBack) {
        stackRef.current = stack.slice(0, -1);
        setDirection("pop");
      } else if (!top || top.pathname !== current.pathname || top.search !== current.search) {
        stackRef.current = [...stack, current];
        setDirection("push");
      }

      setCanGoBack(stackRef.current.length > 1);
    }
  }, [location.pathname, location.search]);

  const goBack = () => {
    const stack = stackRef.current;
    if (stack.length > 1) {
      isNavigatingRef.current = true;
      setDirection("pop");
      const previous = stack[stack.length - 2];
      navigate(`${previous.pathname}${previous.search || ""}`);
      setTimeout(() => { isNavigatingRef.current = false; }, 50);
    }
  };

  return (
    <NavigationContext.Provider value={{ canGoBack, goBack, direction }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}