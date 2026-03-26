import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const logs = [];

        // 1. Check Automation Settings
        const settings = await base44.entities.SystemSetting.filter({});
        const getSetting = (key) => settings.find(s => s.key === key)?.value;
        
        const autoEnabled = getSetting('auto_video_gen_enabled') === 'true';
        const lastGenDate = getSetting('last_auto_gen_date');
        
        const today = new Date().toISOString().split('T')[0];

        // 2. Run Daily Generation if needed
        if (autoEnabled && lastGenDate !== today) {
            logs.push("Starting daily generation...");
            try {
                // Call generateDailyCampaign
                await base44.functions.invoke('generateDailyCampaign', { force: false });
                
                // Update last run date
                const settingId = settings.find(s => s.key === 'last_auto_gen_date')?.id;
                if (settingId) {
                    await base44.entities.SystemSetting.update(settingId, { value: today });
                } else {
                    await base44.entities.SystemSetting.create({ 
                        key: 'last_auto_gen_date', 
                        value: today,
                        description: 'Date of last auto-generation run'
                    });
                }
                logs.push("Daily generation triggered successfully.");
            } catch (e) {
                logs.push(`Daily generation failed: ${e.message}`);
            }
        } else {
            logs.push("Daily generation not needed (already run today or disabled).");
        }

        // 3. Check for Finished Generations
        try {
            const { data: genResult } = await base44.functions.invoke('checkVideoGenerations');
            if (genResult?.updates?.length > 0) {
                logs.push(`Updated ${genResult.updates.length} generated videos.`);
            }
        } catch (e) {
            logs.push(`Check generations failed: ${e.message}`);
        }

        // 4. Process Due Posts (Publish to YouTube)
        try {
            const { data: pubResult } = await base44.functions.invoke('processScheduledPosts');
            if (pubResult?.processed > 0) {
                logs.push(`Published ${pubResult.processed} scheduled posts.`);
            }
        } catch (e) {
            logs.push(`Process posts failed: ${e.message}`);
        }

        // 5. Cleanup Old Videos (Storage Management)
        try {
            const { data: cleanupResult } = await base44.functions.invoke('cleanupPostedVideos');
            if (cleanupResult?.deleted_count > 0) {
                logs.push(`Cleaned up ${cleanupResult.deleted_count} posted videos to save storage.`);
            }
        } catch (e) {
            logs.push(`Cleanup videos failed: ${e.message}`);
        }

        return Response.json({ success: true, logs });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});