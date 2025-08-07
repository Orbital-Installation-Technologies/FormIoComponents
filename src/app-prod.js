import "./patchAllComponents.js";
import premium from '@formio/premium';
import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner";
import Gps from "./components/Gps/Gps";
import ReviewButton from "./components/ReviewButton/ReviewButton.js";

Formio.license = "eyJhbGciOiJQUzI1NiJ9.eyJsaWNlbnNlTmFtZSI6Ik9yYml0YWwgSW5zdGFsbGF0aW9uIFRlY2hub2xvZ2llcyBMaWJyYXJ5IExpY2Vuc2UgdGhyb3VnaCBKdWx5IDI5LCAyMDI2IiwiaWF0IjoxNzUyNDY1NjAwLCJleHAiOjE3ODUzNDA4MDAsImZhaWxEYXRlIjoxNzg4MDE5MjAwLCJ0ZXJtcyI6eyJwcmVtaXVtIjp0cnVlLCJvZmZsaW5lIjp0cnVlLCJlbnRlcnByaXNlQnVpbGRlciI6ZmFsc2UsInJlcG9ydGluZyI6ZmFsc2UsInNxbGNvbm5lY3RvciI6ZmFsc2UsImVuZHBvaW50cyI6WyJmb3JtaW8tcmVuZGVyZXIub3JiaXRhbGN1c3RvbXMuY29tIiwiKi5vcmJpdGFsY3VzdG9tcy5jb20iXSwiaG9zdG5hbWVzIjpbImZvcm1pby1yZW5kZXJlci5vcmJpdGFsY3VzdG9tcy5jb20iLCIqLm9yYml0YWxjdXN0b21zLmNvbSJdfSwiaXNzIjoiaHR0cHM6Ly9mb3JtLmlvIiwic3ViIjoiRm9ybS5pbyJ9.urlZ0zZ3lSfkcsw2OD0gl6kklhPQD7JoDXQfDfpS1h6xfHtSsQng0cS8lvz7mqaatClD9Z2rQD-g3WZ5saJunI6M0spMxhJkqwhl_3Vj3aBI4FmQ4XjFejh6vacvNmy5nlH5QxRaGmkdIg_MFvhQ6x76-Jrw_9MGuOT20kbsf2vt9f7Qv4mj5dBzQjnt8ZAG1y7IpmO_EFikcH1RbvcNzuuI-s23XZuGgbndMBeOks2wTvL2RK7YvFS6h-_qRLnhatu7buZ-1vv_kjzDGTfzQUjsEaEJL8R4PlgHezIamrDPRU-b4YOhbhgPDIwEwWA-DpybAi6cyDyWFUxUgq3rqQ";

Formio.use(premium);

Formio.use([
  {
    components: {
      rating: Rating,
      barcode: BarcodeScanner,
      gps: Gps,
      reviewbutton: ReviewButton,
    },
  },
]);
