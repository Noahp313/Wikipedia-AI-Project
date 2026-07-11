export function getUserId() {
    if (typeof window === "undefined") return null;

    let userId = localStorage.getItem("wikai_user_id");
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem("wikai_user_ud", userId);
    }
    return userId;
}