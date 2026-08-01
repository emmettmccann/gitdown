/**
 * Browser entrypoint.
 *
 * One shell, one React root, one query client for the whole site.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ingestion runs once a minute, so nothing the API returns is worth
      // re-asking for inside of that unless a query says otherwise — which
      // also settles what a focus refetch does, since it only fires on a query
      // that has gone stale. The live thread overrides this with the poll
      // interval, and is the only thing here that wants to be current.
      staleTime: 60_000,
      // Retries are per-query: the ones worth asking twice say so themselves.
      retry: false,
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
