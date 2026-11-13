CREATE TABLE event_activity_requests (
  event_id uuid NOT NULL REFERENCES events(id),
  request_key varchar(100) NOT NULL,
  request_hash text NOT NULL,
  activity_id uuid NOT NULL UNIQUE,
  PRIMARY KEY(event_id,request_key)
);
