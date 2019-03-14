import { main } from "./src/main";

main()
    .then(() => console.log("finish"))
    .catch(err => console.error(err));
