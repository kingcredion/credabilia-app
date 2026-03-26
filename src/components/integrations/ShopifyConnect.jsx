import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, RefreshCw, CheckCircle2, AlertCircle, Link as LinkIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function ShopifyConnect() {
    const [shopDomain, setShopDomain] = useState("");
    const queryClient = useQueryClient();
    
    // Check for success param in URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("shopify_connected") === "true") {
            toast.success("Shopify store connected successfully!");
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            queryClient.invalidateQueries({ queryKey: ['shopify-connection'] });
        }
    }, []);

    const { data: connection, isLoading } = useQuery({
        queryKey: ['shopify-connection'],
        queryFn: async () => {
            const conns = await base44.entities.PlatformConnection.filter({
                platform_name: 'shopify',
                connection_status: 'connected'
            });
            return conns[0] || null;
        }
    });

    const connectMutation = useMutation({
        mutationFn: async (domain) => {
            const { data } = await base44.functions.invoke('shopifyAuth', { 
                action: 'connect', 
                shop: domain 
            });
            return data;
        },
        onSuccess: (data) => {
            if (data.url) {
                window.location.href = data.url;
            }
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || "Failed to initiate connection");
        }
    });

    const importMutation = useMutation({
        mutationFn: async () => {
            const { data } = await base44.functions.invoke('importShopifyProducts');
            return data;
        },
        onSuccess: (data) => {
            toast.success(data.message || "Import completed");
            queryClient.invalidateQueries({ queryKey: ['vendor-items'] }); // Refresh items list if looking at it
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || "Import failed");
        }
    });

    const handleConnect = (e) => {
        e.preventDefault();
        if (!shopDomain) return;
        connectMutation.mutate(shopDomain);
    };

    if (isLoading) return <div className="h-24 bg-gray-100 animate-pulse rounded-lg" />;

    if (connection) {
        return (
            <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="bg-green-100 p-2 rounded-lg">
                                <ShoppingBag className="w-5 h-5 text-green-700" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Shopify Connected</CardTitle>
                                <CardDescription className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                                    {connection.account_name || connection.settings?.shop_url}
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">Active</Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button 
                            onClick={() => importMutation.mutate()} 
                            disabled={importMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white flex-1"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${importMutation.isPending ? 'animate-spin' : ''}`} />
                            {importMutation.isPending ? 'Importing Products...' : 'Sync Products from Shopify'}
                        </Button>
                        <Button variant="outline" asChild className="flex-1 bg-white">
                            <a href={`https://${connection.settings?.shop_url}/admin`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Go to Shopify Admin
                            </a>
                        </Button>
                    </div>
                    {importMutation.data && (
                        <p className="text-xs text-green-600 mt-2 text-center">
                            Last sync: {importMutation.data.imported_count} items imported
                        </p>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div className="bg-gray-100 p-2 rounded-lg">
                        <ShoppingBag className="w-5 h-5 text-gray-700" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Connect Shopify</CardTitle>
                        <CardDescription>Import your inventory automatically</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleConnect} className="space-y-4">
                    <div className="space-y-2">
                        <div className="relative">
                            <Input 
                                placeholder="your-store.myshopify.com" 
                                value={shopDomain}
                                onChange={(e) => setShopDomain(e.target.value)}
                                className="pl-9"
                            />
                            <LinkIcon className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        </div>
                        <p className="text-xs text-gray-500">
                            Enter your ".myshopify.com" domain to connect your store.
                        </p>
                    </div>
                    <Button 
                        type="submit" 
                        disabled={connectMutation.isPending || !shopDomain}
                        className="w-full bg-[#95BF47] hover:bg-[#85AB3D] text-white" // Shopify green-ish
                    >
                        {connectMutation.isPending ? 'Connecting...' : 'Connect Store'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}