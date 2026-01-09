# Rillet API Documentation (via MCP)

## Available Endpoints

```json
{
  "/accounts": {
    "get": "List all accounts"
  },
  "/subsidiaries": {
    "get": "List all subsidiaries"
  },
  "/subsidiaries/{subsidiary_id}": {
    "get": "Retrieve a subsidiary"
  },
  "/organizations/self": {
    "get": "Retrieve an organization"
  },
  "/products": {
    "get": "List all products",
    "post": "Create a product"
  },
  "/products/{product_id}": {
    "get": "Retrieve a product",
    "put": "Update a product",
    "delete": "Delete a product"
  },
  "/customers": {
    "get": "List all customers",
    "post": "Create a customer"
  },
  "/customers/{customer_id}": {
    "get": "Retrieve a customer",
    "put": "Update a customer",
    "delete": "Delete a customer"
  },
  "/customers/{customer_id}/settings/payment": {
    "post": "Setup auto-payment",
    "get": "Get payment method"
  },
  "/contracts": {
    "post": "Create a contract",
    "get": "List all contracts"
  },
  "/contracts/{contract_id}": {
    "get": "Retrieve a contract",
    "put": "Update a contract",
    "delete": "Delete a contract"
  },
  "/contracts/{contract_id}/amendments": {
    "post": "Amend a contract"
  },
  "/contracts/{contract_id}/amendments/preview": {
    "post": "Preview contract amendment"
  },
  "/contracts/{contract_id}/end": {
    "put": "End an open-ended contract"
  },
  "/contract-items/{contract_item_id}/usage": {
    "patch": "Upsert usage record",
    "get": "List all contract item usage records",
    "delete": "Delete a usage record"
  },
  "/invoices": {
    "get": "List all invoices",
    "post": "Create an invoice"
  },
  "/invoices/{invoice_id}": {
    "get": "Retrieve an invoice",
    "delete": "Delete an invoice",
    "put": "Update an invoice"
  },
  "/invoices/{invoice_id}/taxes": {
    "post": "Update invoice taxes"
  },
  "/invoice-payments": {
    "get": "List all invoice payments"
  },
  "/invoices/{invoice_id}/payments": {
    "get": "List payments for invoice",
    "post": "Create an invoice payment"
  },
  "/invoices/{invoice_id}/sent-status": {
    "put": "Update invoice sent status"
  },
  "/credit-memos": {
    "get": "List all credit memos",
    "post": "Create a credit memo"
  },
  "/credit-memos/{credit_memo_id}": {
    "get": "Retrieve a credit memo",
    "delete": "Delete a credit memo",
    "put": "Update a credit memo"
  },
  "/credit-memos/{credit_memo_id}/taxes": {
    "post": "Update credit memo taxes"
  },
  "/vendors": {
    "get": "List all vendors",
    "post": "Create a vendor"
  },
  "/vendors/{vendor_id}": {
    "get": "Retrieve a vendor",
    "put": "Update a vendor",
    "delete": "Delete a vendor"
  },
  "/bills": {
    "get": "List all bills",
    "post": "Create a bill"
  },
  "/bills/{bill_id}": {
    "get": "Retrieve a bill",
    "put": "Update a bill",
    "post": "Upload document",
    "delete": "Delete a bill"
  },
  "/bills/{bill_id}/payments": {
    "get": "List bill payments",
    "post": "Create a bill payment"
  },
  "/bills/{bill_id}/payments/{payment_id}": {
    "delete": "Delete a bill payment"
  },
  "/charges": {
    "get": "List all charges"
  },
  "/charges/{charge_id}": {
    "get": "Retrieve a charge",
    "delete": "Delete a charge"
  },
  "/reimbursements": {
    "get": "List all reimbursements"
  },
  "/reimbursements/{reimbursement_id}": {
    "get": "Retrieve a reimbursement",
    "delete": "Delete a reimbursement"
  },
  "/journal-entries": {
    "post": "Create a journal entry",
    "get": "List all journal entries"
  },
  "/journal-entries/{journal_entry_id}": {
    "get": "Retrieve a journal entry",
    "put": "Update a journal entry",
    "delete": "Delete a journal entry"
  },
  "/bank-accounts": {
    "get": "List all bank accounts"
  },
  "/bank-accounts/{bank_account_id}": {
    "get": "Retrieve a bank account"
  },
  "/reports/arr-waterfall": {
    "get": "Retrieve ARR waterfall report"
  },
  "/books/periods/last-closed": {
    "get": "Retrieve last book closed period"
  },
  "/health": {
    "get": "Health check"
  },
  "/api-key": {
    "get": "Get API key information"
  },
  "/fields": {
    "get": "Get fields",
    "post": "Create field"
  }
}
```
