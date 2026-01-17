// Cloudflare Images Client-Side Integration

export interface CloudflareConfig {
    accountId: string;
    apiToken: string;
}

export const uploadToCloudflare = async (
    blob: Blob,
    config: CloudflareConfig,
    filename: string = "floorplan.png"
): Promise<string> => {
    
    const formData = new FormData();
    formData.append('file', blob, filename);

    // Note: In a production app, uploading directly from client exposes the API Token.
    // Ideally, you would use a backend or Cloudflare Worker.
    // For this architectural demo, we call the API directly as requested.
    
    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`
                },
                body: formData
            }
        );

        const result = await response.json();
        
        if (!result.success) {
            console.error("Cloudflare Error:", result.errors);
            throw new Error(result.errors?.[0]?.message || "Upload to Cloudflare failed");
        }

        // Return the first variant URL (usually 'public')
        const variants = result.result.variants;
        if (variants && variants.length > 0) {
            return variants[0];
        }
        
        throw new Error("No image variants returned");

    } catch (error: any) {
        console.error("Upload failed", error);
        throw error;
    }
};