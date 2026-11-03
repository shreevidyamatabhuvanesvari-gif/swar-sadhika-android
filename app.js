import { bootSwarSadhika } from "./app/main.js?v=0.9.0";
bootSwarSadhika().catch(error => {
  console.error("Swar-Sadhika bootstrap failed:", error);
  const status = document.getElementById("connectionStatus");
  if (status) status.textContent = "App त्रुटि: " + error.message;
});
