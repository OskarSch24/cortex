import CoreLocation
import Foundation

// Der Standort des Macs für „Mein Standort“ im Chat — über CoreLocation.
//
// Läuft als eigene, unsichtbare App (CortexLocation.app, LSUIElement) und wird
// vom Host über `open -W -g --stdout <Datei>` gestartet: Die Ortungsdienste
// fragen nur Programme mit eigener App-Kennung und Freigabetext; ein nacktes
// Kommandozeilenprogramm übergehen sie stumm. Die Webview kann es gar nicht —
// ihr Rahmen sperrt navigator.geolocation.
//
// Schnell: Ist die Freigabe da und der zuletzt bekannte Ort frisch, kommt er
// sofort. Sonst die erste brauchbare Messung. Ausgabe: eine JSON-Zeile —
// {"lat","lon","accuracy"} oder {"error","code"} mit code denied | restricted
// | disabled | undetermined | unavailable | timeout.

final class Locator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var finished = false
    private var asked = false

    func start() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        guard CLLocationManager.locationServicesEnabled() else {
            finish(["error": "Die Ortungsdienste sind auf diesem Mac ausgeschaltet.", "code": "disabled"])
            return
        }
        handle(manager.authorizationStatus)
    }

    private func handle(_ status: CLAuthorizationStatus) {
        switch status {
        case .notDetermined:
            guard !asked else { return }
            asked = true
            manager.requestWhenInUseAuthorization()
            // Zeit für die Abfrage von macOS — nur beim allerersten Mal.
            after(60) { self.finish(["error": "Die Standortfreigabe wurde nicht beantwortet.", "code": "undetermined"]) }
        case .denied:
            finish(["error": "macOS hat Cortex den Standort nicht freigegeben.", "code": "denied"])
        case .restricted:
            finish(["error": "Der Standort ist auf diesem Mac eingeschränkt.", "code": "restricted"])
        default:
            // Der zuletzt bekannte Ort, wenn er frisch genug ist: sofort.
            if let last = manager.location, -last.timestamp.timeIntervalSinceNow < 600, last.horizontalAccuracy >= 0, last.horizontalAccuracy < 3000 {
                report(last)
                return
            }
            manager.startUpdatingLocation()
            after(12) {
                if let last = self.manager.location { self.report(last) }
                else { self.finish(["error": "Die Ortung hat zu lange gedauert.", "code": "timeout"]) }
            }
        }
    }

    private func after(_ seconds: Double, _ work: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    private func report(_ location: CLLocation) {
        finish(["lat": location.coordinate.latitude, "lon": location.coordinate.longitude, "accuracy": location.horizontalAccuracy])
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus != .notDetermined { handle(manager.authorizationStatus) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Die erste Messung genügt, solange sie grob stimmt — kein Warten auf Meter-Genauigkeit.
        guard let location = locations.last, location.horizontalAccuracy >= 0, location.horizontalAccuracy < 3000 else { return }
        report(location)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let code = (error as? CLError)?.code
        if code == .locationUnknown { return }
        if code == .denied {
            finish(["error": "macOS hat Cortex den Standort nicht freigegeben.", "code": "denied"])
        } else {
            finish(["error": "Der Standort ist gerade nicht bestimmbar (\(error.localizedDescription)).", "code": "unavailable"])
        }
    }

    private func finish(_ payload: [String: Any]) {
        guard !finished else { return }
        finished = true
        manager.stopUpdatingLocation()
        if let data = try? JSONSerialization.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) {
            print(line)
        }
        fflush(stdout)
        exit(payload["error"] == nil ? 0 : 2)
    }
}

let locator = Locator()
locator.start()
RunLoop.main.run()
