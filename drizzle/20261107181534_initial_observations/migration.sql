CREATE TABLE "latest_observations" (
	"object_id" text PRIMARY KEY,
	"observation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"observation_id" uuid PRIMARY KEY,
	"object_id" text NOT NULL,
	"observed_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "observations_object_observation_key" UNIQUE("object_id","observation_id")
);
--> statement-breakpoint
ALTER TABLE "latest_observations" ADD CONSTRAINT "latest_observations_observation_fk" FOREIGN KEY ("object_id","observation_id") REFERENCES "observations"("object_id","observation_id");