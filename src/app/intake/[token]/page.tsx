// Non-federal intake redirects to the shared portal page
// Both /portal/{token} and /intake/{token} use the same component
// The session API determines federal vs general and adjusts accordingly

export { default } from "../../portal/[token]/page";
