import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleMobileIdentity {
    sub: string;
    email: string | null;
    name: string | null;
    picture: string | null;
}

export async function verifyGoogleIdToken(
    idToken: string,
    clientIds: string[]
): Promise<GoogleMobileIdentity | null> {
    if (!idToken || clientIds.length === 0) return null;

    try {
        const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
            issuer: [GOOGLE_ISSUER, "accounts.google.com"],
            audience: clientIds,
        });

        const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
        const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
        const name = typeof payload.name === "string" ? payload.name.trim() : null;
        const picture = typeof payload.picture === "string" ? payload.picture.trim() : null;
        const emailVerified = payload.email_verified === true;

        if (!sub || !email || !emailVerified) return null;

        return { sub, email, name, picture };
    } catch {
        return null;
    }
}
