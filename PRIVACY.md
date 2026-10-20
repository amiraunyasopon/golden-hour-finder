# Privacy Policy

**Effective date:** October 19, 2026

Golden Hour Finder helps users view golden hour, blue hour, sunrise, and sunset
times for a location. This policy describes the information the extension uses
to provide that feature.

## Information the extension uses

- The URL of the active tab, when it is a Google Maps URL. The extension
  examines the URL locally to extract coordinates and an available place name;
  it does not read Google Maps page contents.
- Device location, when the browser provides it after the user grants location
  permission. If there is no usable Google Maps location or saved device
  location, the extension may ask the browser for permission to use device
  location.
- For device locations, the extension may save the latitude, longitude,
  location source, and approximate place name in Chrome's local extension
  storage so the location can be reused when the popup opens again.

Sunrise, sunset, golden-hour, blue-hour, and time-zone calculations are
performed locally in the extension.

## Reverse geocoding

When device location is used, the extension may send the device's latitude and
longitude to OpenStreetMap's Nominatim reverse-geocoding service to obtain an
approximate city or locality name. The extension does not send coordinates
parsed from Google Maps URLs to Nominatim.

The extension may make this request again when refreshing the approximate
place name for a saved device location. The request is made only for reverse
geocoding; Golden Hour Finder does not use the result to create an account,
profile, or location history.

The reverse-geocoded place name is used to show an approximate locality in the
popup. Nominatim is an independent service. Its handling of requests,
including network metadata and any retention or use of request data, is
governed by the
[OpenStreetMap Foundation Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

## What the extension does not do

Golden Hour Finder does not:

- Create user accounts.
- Sell location information.
- Use advertising or analytics trackers.
- Collect browsing history.
- Transmit location coordinates to a service other than the optional Nominatim
  reverse-geocoding request described above.

## Local storage and deletion

The saved device location remains in Chrome's local extension storage. Users
can remove it by removing the extension's stored data through Chrome's
extension or site-data controls, or by uninstalling the extension. The
extension does not maintain a server-side account or location history.
Reverse-geocoding requests are used only to obtain the approximate locality
name and are not used by Golden Hour Finder to build a user profile.

## Contact

**Publisher:** Amir Aunyasopon

**Contact:** amiraunyasopon@gmail.com