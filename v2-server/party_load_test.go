package main

import "testing"

// Keep a representative party-sized room cheap to snapshot. This is a fast
// regression guard for audience fan-out: 8 players plus the 64-person
// audience cap should remain safe to serialize every broadcast tick.
func TestPartyAudienceCapacitySnapshot(t *testing.T) {
	r := rotationTestRoom(partyMaxPlayers)
	r.partyConfig = defaultPartySessionSettings()
	for index := 0; index < partyMaxAudience; index++ {
		id := "a" + strconvItoa(index)
		r.audience[id] = &partyAudienceMember{ID: id, Name: "Audience " + strconvItoa(index), Avatar: partyPlayerAvatar("", index), Connected: true}
	}
	for index := 0; index < 100; index++ {
		snapshot := r.snapshotLocked("")
		if snapshot["audienceCount"] != partyMaxAudience {
			t.Fatalf("snapshot audience count = %#v, want %d", snapshot["audienceCount"], partyMaxAudience)
		}
		if snapshot["audienceCapacity"] != partyMaxAudience {
			t.Fatalf("snapshot audience capacity = %#v, want %d", snapshot["audienceCapacity"], partyMaxAudience)
		}
	}
}
