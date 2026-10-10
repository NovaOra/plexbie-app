import { NewTicketSheet } from "../../features/tickets/NewTicketSheet";
import { ConfirmProvider } from "../../ui/Confirm";

// On iOS the sheet is presented over the app, and a dialog only shows when it opens from
// inside it: so the sheet asks its questions with a dialog of its own.
export default function NewTicket() {
  return (
    <ConfirmProvider>
      <NewTicketSheet />
    </ConfirmProvider>
  );
}
