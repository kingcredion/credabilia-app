import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Plus, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import AddressForm from "./AddressForm";

const EMPTY_FORM = {
  label: "Home",
  recipient_name: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  is_default: false,
};

export default function AddressBook({ userEmail, compact = false, selectedId, onSelect }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [googleApiKey, setGoogleApiKey] = useState(null);
  const queryClient = useQueryClient();
  const line2Ref = useRef(null);

  // Fetch Google API key once on mount
  useEffect(() => {
    base44.functions.invoke("getGoogleMapsKey", {})
      .then((res) => { if (res.data?.key) setGoogleApiKey(res.data.key); })
      .catch(() => console.warn("[AddressBook] Google API key unavailable"));
  }, []);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["user-addresses", userEmail],
    queryFn: () => base44.entities.UserAddress.filter({ user_email: userEmail }, "-created_date"),
    enabled: !!userEmail,
  });

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    const cleaned = {
      recipient_name: form.recipient_name?.trim() || "",
      phone: form.phone?.trim() || "",
      address_line1: form.address_line1?.trim() || "",
      address_line2: form.address_line2?.trim() || "",
      city: form.city?.trim() || "",
      state: form.state?.trim() || "",
      postal_code: form.postal_code?.trim() || "",
      country: form.country?.trim() || "US",
      is_default: !!form.is_default,
    };

    if (!userEmail)              { toast.error("Missing user email"); return; }
    if (!cleaned.recipient_name) { toast.error("Full name is required"); return; }
    if (!cleaned.address_line1)  { toast.error("Street address is required"); return; }
    if (!cleaned.city)           { toast.error("City is required"); return; }
    if (!cleaned.state)          { toast.error("State is required"); return; }
    if (!cleaned.postal_code)    { toast.error("ZIP code is required"); return; }

    console.log("[AddressBook] Validation passed, saving address:", cleaned);
    saveMutation.mutate(cleaned);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (!userEmail) throw new Error("Missing user email");
      
      // Clear default on other addresses if needed
      if (data.is_default) {
        try {
          await Promise.all(
            addresses
              .filter((a) => a.is_default && a.id !== editing?.id)
              .map((a) => base44.entities.UserAddress.update(a.id, { is_default: false }))
          );
          console.log("[AddressBook] Cleared default from other addresses");
        } catch (err) {
          console.warn("[AddressBook] Failed to clear default from other addresses:", err);
        }
      }
      
      const payload = { ...data, user_email: userEmail };
      console.log("[AddressBook] Sending save payload:", payload);
      
      if (editing) {
        console.log("[AddressBook] Updating address ID:", editing.id);
        return base44.entities.UserAddress.update(editing.id, payload);
      } else {
        console.log("[AddressBook] Creating new address");
        return base44.entities.UserAddress.create(payload);
      }
    },
    onSuccess: (response) => {
      console.log("[AddressBook] Save successful, response:", response);
      queryClient.invalidateQueries({ queryKey: ["user-addresses", userEmail] });
      const wasEditing = !!editing;
      closeForm();
      toast.success(wasEditing ? "Address updated" : "Address saved");
    },
    onError: (error) => {
      console.error("[AddressBook] Save failed with error:", error);
      const errorMsg = error?.response?.data?.message || error?.message || "Failed to save address. Please try again.";
      toast.error(errorMsg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UserAddress.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-addresses", userEmail] });
      toast.success("Address removed");
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (address) => {
      await Promise.all(
        addresses
          .filter((a) => a.is_default && a.id !== address.id)
          .map((a) => base44.entities.UserAddress.update(a.id, { is_default: false }))
      );
      await base44.entities.UserAddress.update(address.id, { is_default: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-addresses", userEmail] }),
  });

  const openEdit = (addr) => {
    setEditing(addr);
    setForm({
      label: addr.label || "Home",
      recipient_name: addr.recipient_name || "",
      phone: addr.phone || "",
      address_line1: addr.address_line1 || "",
      address_line2: addr.address_line2 || "",
      city: addr.city || "",
      state: addr.state || "",
      postal_code: addr.postal_code || "",
      country: addr.country || "US",
      is_default: addr.is_default || false,
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, is_default: addresses.length === 0 });
    setShowForm(true);
  };

  return (
    <div className="space-y-3">
      {/* Address list */}
      {isLoading ? (
        <div className="h-16 animate-pulse glass-panel rounded-lg border-border/30" />
      ) : addresses.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm glass-panel rounded-lg border-border/30 border-dashed">
          <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
          No saved addresses yet
        </div>
      ) : (
        <div className={`space-y-2 ${compact ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
          {addresses.map((addr) => (
            <div
              key={addr.id}
              onClick={() => onSelect && onSelect(addr)}
              className={`glass-panel rounded-lg p-3 transition-all ${
                onSelect ? "cursor-pointer hover:border-blue-500/50" : ""
              } ${selectedId === addr.id
                  ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                  : "border-border/50"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm text-gray-900 dark:text-foreground">{addr.label}</span>
                    {addr.is_default && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 h-auto">Default</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-foreground/80">{addr.recipient_name}</p>
                   <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                     {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}, {addr.city}, {addr.state} {addr.postal_code}
                  </p>
                </div>
                {!compact && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!addr.is_default && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-yellow-500"
                        onClick={(e) => { e.stopPropagation(); setDefaultMutation.mutate(addr); }} title="Set as default">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                      onClick={(e) => { e.stopPropagation(); openEdit(addr); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(addr.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={openNew} className="w-full gap-2">
        <Plus className="w-4 h-4" />
        Add New Address
      </Button>

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) closeForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Address" : "Add New Address"}</DialogTitle>
          </DialogHeader>

          {/* The full form — Google widget at top, manual inputs below */}
          <AddressForm
            form={form}
            setForm={setForm}
            apiKey={googleApiKey}
            line2Ref={line2Ref}
          />

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={
                saveMutation.isPending ||
                !userEmail ||
                !form.recipient_name?.trim() ||
                !form.address_line1?.trim() ||
                !form.city?.trim() ||
                !form.state?.trim() ||
                !form.postal_code?.trim()
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? "Saving…" : "Save Address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}