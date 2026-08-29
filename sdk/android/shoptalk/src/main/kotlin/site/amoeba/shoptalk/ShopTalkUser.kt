package site.amoeba.shoptalk

/**
 * Identity the host app has already authenticated.
 *
 * [hash] is `HMAC_SHA256(embed_secret, userId)` and MUST be produced on the
 * host's server — the secret must never ship inside the app bundle, which
 * anyone can unpack. A rejected signature does not block the conversation: the
 * visitor simply continues as a guest.
 */
data class ShopTalkUser(
    val userId: String,
    val hash: String,
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
)
