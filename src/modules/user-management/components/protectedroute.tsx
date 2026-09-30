import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserPermissions } from '../hooks/useUserPermissions';
import { type Screen } from '../models/userService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredScreen: Screen;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ 
  children, 
  requiredScreen,
  fallback
}: ProtectedRouteProps) {
  const { hasPermission, isLoading, userData, isSuperAdmin } = useUserPermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return <Navigate to="/login" replace />;
  }

  // ✅ Super admin always has access to everything — skip permission check entirely
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  if (!hasPermission(requiredScreen)) {
    // Dashboard specifically: redirect to /reports silently instead of error wall.
    if (requiredScreen === 'Dashboard') {
      return <Navigate to="/reports" replace />;
    }

    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
          <Card className="w-full max-w-md shadow-lg border-red-200">
            <CardHeader className="bg-red-50 border-b border-red-200">
              <CardTitle className="text-red-700 text-xl">Access Denied</CardTitle>
              <CardDescription className="text-red-600">
                You don't have permission to access this section
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">
                    <span className="font-semibold">Screen:</span> {requiredScreen}
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    <span className="font-semibold">Status:</span> Not authorized
                  </p>
                </div>
                <p className="text-sm text-gray-600">
                  Please contact your administrator to request access to this feature.
                </p>
                <Button 
                  onClick={() => window.history.back()}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Go Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    );
  }

  return <>{children}</>;
}