import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function PreferencesTab({ user }) {
  return (
    <div className="space-y-6">
      {/* Notifications & Preferences Coming Soon */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-400/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-1">
                More preferences coming soon
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                Email notifications, appearance preferences, and other settings will be available here.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Language Setting */}
      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>Your current language preference.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted/30 dark:bg-muted/10 rounded-lg border">
            <p className="text-sm font-medium text-gray-900 dark:text-foreground">
              {user?.preferred_language === "en" && "English"}
              {user?.preferred_language === "es" && "Español"}
              {user?.preferred_language === "fr" && "Français"}
              {!["en", "es", "fr"].includes(user?.preferred_language) && "English"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Change this in the Profile tab.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}